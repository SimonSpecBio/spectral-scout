import { desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { facilities, monitoringThresholds, pestEvents, scoutingObservations, treatments } from "@/db/schema";
import { resolvePestEvent } from "@/lib/pest-events";
import {
  DEFAULT_DENSITY_THRESHOLD,
  DEFAULT_INFESTED_PCT_THRESHOLD,
  isOverThreshold,
  sessionMetric,
  thresholdFor,
  type MetricKind,
  type SessionMetric,
  type SpeciesThresholds,
} from "@/lib/scout-metric";
import { findPestProgram } from "@/lib/treatments-catalog";

// Re-exported so existing server-side callers (API routes, server
// components, other lib modules) can keep importing everything from this
// one module -- only PestEventDetail.tsx (a client component) needs to
// import the pure pieces from lib/scout-metric.ts directly, since this
// file's `db` import can't be bundled for the browser.
export { DEFAULT_DENSITY_THRESHOLD, DEFAULT_INFESTED_PCT_THRESHOLD, isOverThreshold, sessionMetric, metricLabel } from "@/lib/scout-metric";
export type { MetricKind, SessionMetric, SpeciesThresholds } from "@/lib/scout-metric";

// Falls back to this before ever reaching the flat generic DEFAULT_*
// constants -- lib/treatments-catalog.ts's PestProgram entries carry real,
// sourced per-species thresholds (pest-threshold research pass, 2026-08-21)
// for the handful of species where a defensible number actually exists.
// Species with no PestProgram match, or no threshold field set on their
// program, still land on the flat generic defaults -- unchanged behavior.
function builtinThresholdsFor(pestSpecies: string): SpeciesThresholds {
  const program = findPestProgram(pestSpecies);
  return {
    pct: program?.defaultOccupancyPctThreshold ?? DEFAULT_INFESTED_PCT_THRESHOLD,
    density: program?.defaultDensityThreshold ?? DEFAULT_DENSITY_THRESHOLD,
    presenceTriggered: program?.presenceTriggered ?? false,
  };
}

// Batch lookup, both metrics at once -- every caller below needs whichever
// one matches the session(s) it's looking at, and reads are cheap/already
// org-scoped, so there's no reason to make callers pick up-front. An org
// row that only overrides ONE of the two metrics (set a custom density
// threshold but left occupancy untouched, say) still gets the real
// per-species builtin for the other, not the flat generic -- a partial
// override shouldn't silently degrade the metric the org didn't touch.
async function getSpeciesThresholdsMap(organizationId: string): Promise<Map<string, SpeciesThresholds>> {
  const rows = await db.select().from(monitoringThresholds).where(eq(monitoringThresholds.organizationId, organizationId));
  const map = new Map<string, SpeciesThresholds>();
  for (const row of rows) {
    const builtin = builtinThresholdsFor(row.pestSpecies);
    map.set(row.pestSpecies.toLowerCase(), {
      pct: row.infestedPctThreshold ?? builtin.pct,
      density: row.densityThreshold ?? builtin.density,
      presenceTriggered: row.presenceTriggeredOverride ?? builtin.presenceTriggered,
    });
  }
  return map;
}

// Single-species lookup for a spot that already knows which event/species
// it cares about (the pest-event detail page's pressure chart) instead of
// computeMonitoringAlerts' batch pass over every active event.
export async function getSpeciesThresholds(organizationId: string, pestSpecies: string): Promise<SpeciesThresholds> {
  const map = await getSpeciesThresholdsMap(organizationId);
  return map.get(pestSpecies.toLowerCase()) ?? builtinThresholdsFor(pestSpecies);
}

export interface MonitoringAlert {
  eventId: string;
  facilityId: string;
  facilityAreaId: string | null;
  pestSpecies: string;
  metricKind: MetricKind;
  value: number;
  threshold: number;
  at: Date;
}

// The ThresholdEngine ARCHITECTURE.md ยง3 describes: "sample -> reduce to
// metric -> compare to threshold -> status." Plant sampling, Counts, and
// disease assessment all converge on the same sampleSize/pestCount SHAPE
// (scoutingObservations), but not the same metric or threshold -- see
// sessionMetric's comment. Complements the dashboard's existing trend-
// based "trending up" heuristic (lib/pest-event-signals.ts) rather than
// replacing it: this is a real configured numeric comparison, that one is
// a shape-of-the-curve signal.
export async function computeMonitoringAlerts(organizationId: string): Promise<MonitoringAlert[]> {
  const orgFacilities = await db.select().from(facilities).where(eq(facilities.organizationId, organizationId));
  const facilityIds = orgFacilities.map((f) => f.id);
  if (facilityIds.length === 0) return [];

  const events = await db.select().from(pestEvents).where(inArray(pestEvents.facilityId, facilityIds));
  const activeEvents = events.filter((e) => e.status === "active");
  if (activeEvents.length === 0) return [];

  const thresholdsBySpecies = await getSpeciesThresholdsMap(organizationId);

  // Latest session per event, in one query rather than N -- pull every
  // session for these events, already newest-first, and keep the first one
  // seen per event.
  const eventIds = activeEvents.map((e) => e.id);
  const sessions = await db
    .select()
    .from(scoutingObservations)
    .where(inArray(scoutingObservations.promotedPestEventId, eventIds))
    .orderBy(desc(scoutingObservations.createdAt));
  const latestByEvent = new Map<string, (typeof sessions)[number]>();
  for (const s of sessions) {
    if (!s.promotedPestEventId || latestByEvent.has(s.promotedPestEventId)) continue;
    latestByEvent.set(s.promotedPestEventId, s);
  }

  const alerts: MonitoringAlert[] = [];
  for (const event of activeEvents) {
    const latest = latestByEvent.get(event.id);
    if (!latest) continue;
    const metric = sessionMetric(latest);
    if (!metric) continue;

    const thresholds = thresholdsBySpecies.get(event.pestSpecies.toLowerCase()) ?? builtinThresholdsFor(event.pestSpecies);
    if (!isOverThreshold(metric, thresholds)) continue;

    alerts.push({
      eventId: event.id,
      facilityId: event.facilityId,
      facilityAreaId: event.facilityAreaId,
      pestSpecies: event.pestSpecies,
      metricKind: metric.kind,
      value: metric.value,
      // 0 for a presence-triggered species -- the effective threshold IS
      // "any detection," not a real percentage/density number.
      threshold: thresholds.presenceTriggered ? 0 : thresholdFor(metric, thresholds),
      at: latest.createdAt,
    });
  }
  return alerts;
}

// "Once an infestation is under control, the event closes itself." Checked
// after each new monitoring session is logged (the monitoring POST route),
// not on a schedule -- same "computed as a side effect of the write that
// could change the answer" spirit as the rest of this app rather than a
// cron job. Requires the last AUTO_RESOLVE_CONSECUTIVE_SESSIONS sessions
// (not just the latest one) to all be under threshold, so a single noisy
// low count can't flip an event closed. Returns the resolved row, or null
// if the event didn't qualify (still active, wrong status, not enough
// sessions yet, or not all of them under threshold).
const AUTO_RESOLVE_CONSECUTIVE_SESSIONS = 2;

export async function maybeAutoResolve(eventId: string, organizationId: string) {
  const [event] = await db.select().from(pestEvents).where(eq(pestEvents.id, eventId));
  if (!event || event.status !== "active") return null;

  const sessions = await db
    .select()
    .from(scoutingObservations)
    .where(eq(scoutingObservations.promotedPestEventId, eventId))
    .orderBy(desc(scoutingObservations.createdAt))
    .limit(AUTO_RESOLVE_CONSECUTIVE_SESSIONS);
  if (sessions.length < AUTO_RESOLVE_CONSECUTIVE_SESSIONS) return null;

  const thresholds = await getSpeciesThresholds(organizationId, event.pestSpecies);
  const allBelowThreshold = sessions.every((s) => {
    const metric = sessionMetric(s);
    if (!metric) return false;
    return !isOverThreshold(metric, thresholds);
  });
  if (!allBelowThreshold) return null;

  return resolvePestEvent(eventId, { auto: true });
}

export interface EscalationAlert {
  eventId: string;
  facilityId: string;
  facilityAreaId: string | null;
  pestSpecies: string;
  daysSinceTreatment: number;
  metricKind: MetricKind;
  baselineValue: number;
  latestValue: number;
  at: Date;
}

// The mirror image of maybeAutoResolve: escalateIfNoDeclineDays (per-pest,
// lib/treatments-catalog.ts) existed as real data with nothing reading it.
// An active event that's been treated, where enough time has passed
// (escalateIfNoDeclineDays since the most recent treatment) and the
// latest monitoring session shows no meaningful decline vs the baseline
// around when that treatment happened, surfaces as an alert suggesting
// the grower try a different tier -- never auto-escalates anything
// itself, same "suggestion, not an automatic action" rule as trap/
// scouting alerts. "Meaningful decline" is a >=25% relative drop in the
// metric's own value -- a deliberately loose bar so normal noisy
// fluctuation doesn't get flagged, only a treatment that's genuinely not
// working. Works the same whether that value is occupancy % or density
// (pests/leaf); baseline and latest must be the SAME metric kind to
// compare at all (a grower switching methods mid-event is rare enough
// that skipping the alert that one time beats comparing across scales).
const MEANINGFUL_DECLINE_PCT = 25;

export async function computeEscalationAlerts(organizationId: string): Promise<EscalationAlert[]> {
  const orgFacilities = await db.select().from(facilities).where(eq(facilities.organizationId, organizationId));
  const facilityIds = orgFacilities.map((f) => f.id);
  if (facilityIds.length === 0) return [];

  const events = await db.select().from(pestEvents).where(inArray(pestEvents.facilityId, facilityIds));
  const activeEvents = events.filter((e) => e.status === "active");
  if (activeEvents.length === 0) return [];
  const eventIds = activeEvents.map((e) => e.id);

  const allTreatments = await db.select().from(treatments).where(inArray(treatments.pestEventId, eventIds));
  const treatmentsByEvent = new Map<string, typeof allTreatments>();
  for (const t of allTreatments) {
    if (!t.pestEventId) continue;
    treatmentsByEvent.set(t.pestEventId, [...(treatmentsByEvent.get(t.pestEventId) ?? []), t]);
  }

  // Newest-first, same convention as computeMonitoringAlerts.
  const allSessions = await db
    .select()
    .from(scoutingObservations)
    .where(inArray(scoutingObservations.promotedPestEventId, eventIds))
    .orderBy(desc(scoutingObservations.createdAt));
  const sessionsByEvent = new Map<string, typeof allSessions>();
  for (const s of allSessions) {
    if (!s.promotedPestEventId) continue;
    sessionsByEvent.set(s.promotedPestEventId, [...(sessionsByEvent.get(s.promotedPestEventId) ?? []), s]);
  }

  const alerts: EscalationAlert[] = [];
  for (const event of activeEvents) {
    const program = findPestProgram(event.pestSpecies);
    if (!program?.followUp) continue;

    const eventTreatments = treatmentsByEvent.get(event.id) ?? [];
    if (eventTreatments.length === 0) continue; // nothing applied yet, nothing to escalate from

    const lastTreatment = [...eventTreatments].sort((a, b) => b.appliedAt.getTime() - a.appliedAt.getTime())[0];
    const daysSinceTreatment = (Date.now() - lastTreatment.appliedAt.getTime()) / 86_400_000;
    if (daysSinceTreatment < program.followUp.escalateIfNoDeclineDays) continue;

    const sessions = sessionsByEvent.get(event.id) ?? [];
    const postTreatment = sessions.filter((s) => s.createdAt.getTime() >= lastTreatment.appliedAt.getTime());
    if (postTreatment.length === 0) continue; // no fresh data to judge by yet
    const latest = postTreatment[0];
    const latestMetric = sessionMetric(latest);
    if (!latestMetric) continue;

    // Baseline: whichever session sat closest to the treatment (last one
    // before it), falling back to the event's earliest session if the
    // treatment was applied before any monitoring happened.
    const preTreatment = sessions.filter((s) => s.createdAt.getTime() < lastTreatment.appliedAt.getTime());
    const baseline = preTreatment[0] ?? sessions[sessions.length - 1];
    const baselineMetric = baseline ? sessionMetric(baseline) : null;
    if (!baselineMetric || baselineMetric.kind !== latestMetric.kind) continue;
    if (baselineMetric.value <= 0) continue; // nothing to decline from

    const declinePct = ((baselineMetric.value - latestMetric.value) / baselineMetric.value) * 100;
    if (declinePct >= MEANINGFUL_DECLINE_PCT) continue;

    alerts.push({
      eventId: event.id,
      facilityId: event.facilityId,
      facilityAreaId: event.facilityAreaId,
      pestSpecies: event.pestSpecies,
      daysSinceTreatment: Math.round(daysSinceTreatment),
      metricKind: latestMetric.kind,
      baselineValue: baselineMetric.value,
      latestValue: latestMetric.value,
      at: latest.createdAt,
    });
  }
  return alerts.sort((a, b) => b.at.getTime() - a.at.getTime());
}
