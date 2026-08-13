import { desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { facilities, monitoringThresholds, pestEvents, scoutingObservations, treatments } from "@/db/schema";
import { resolvePestEvent } from "@/lib/pest-events";
import { findPestProgram } from "@/lib/treatments-catalog";

// Falls back to this whenever an org hasn't set a custom threshold for a
// species -- lands near the middle of the real figures in
// treatments.json's exampleThreshold text (TSSM "10-15%", aphid "5-10%
// plants"), a reasonable general default across the catalog rather than a
// number invented from nothing.
export const DEFAULT_INFESTED_PCT_THRESHOLD = 15;

// Single-species lookup for a spot that already knows which event/species
// it cares about (the pest-event detail page's pressure chart) instead of
// computeMonitoringAlerts' batch pass over every active event.
export async function getSpeciesThreshold(organizationId: string, pestSpecies: string): Promise<number> {
  const rows = await db.select().from(monitoringThresholds).where(eq(monitoringThresholds.organizationId, organizationId));
  const match = rows.find((t) => t.pestSpecies.toLowerCase() === pestSpecies.toLowerCase());
  return match?.infestedPctThreshold ?? DEFAULT_INFESTED_PCT_THRESHOLD;
}

export interface MonitoringAlert {
  eventId: string;
  facilityId: string;
  facilityAreaId: string | null;
  pestSpecies: string;
  infestedPct: number;
  threshold: number;
  at: Date;
}

// The ThresholdEngine ARCHITECTURE.md ยง3 describes: "sample -> reduce to
// metric -> compare to threshold -> status." Plant sampling, Counts, and
// disease assessment all already converge on the same sampleSize/pestCount
// shape (scoutingObservations), so the metric is the same one calculation
// (pestCount/sampleSize) regardless of which method produced it -- method
// never branches downstream of this function, per the convergence rule.
// Complements the dashboard's existing trend-based "trending up" heuristic
// (lib/pest-event-signals.ts) rather than replacing it: this is a real
// configured numeric comparison, that one is a shape-of-the-curve signal.
export async function computeMonitoringAlerts(organizationId: string): Promise<MonitoringAlert[]> {
  const orgFacilities = await db.select().from(facilities).where(eq(facilities.organizationId, organizationId));
  const facilityIds = orgFacilities.map((f) => f.id);
  if (facilityIds.length === 0) return [];

  const events = await db.select().from(pestEvents).where(inArray(pestEvents.facilityId, facilityIds));
  const activeEvents = events.filter((e) => e.status === "active");
  if (activeEvents.length === 0) return [];

  const thresholdRows = await db.select().from(monitoringThresholds).where(eq(monitoringThresholds.organizationId, organizationId));
  const thresholdBySpecies = new Map(thresholdRows.map((t) => [t.pestSpecies.toLowerCase(), t.infestedPctThreshold]));

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
    if (!latest || !latest.sampleSize) continue;

    const infestedPct = Math.round(((latest.pestCount ?? 0) / latest.sampleSize) * 100);
    const threshold = thresholdBySpecies.get(event.pestSpecies.toLowerCase()) ?? DEFAULT_INFESTED_PCT_THRESHOLD;
    if (infestedPct < threshold) continue;

    alerts.push({
      eventId: event.id,
      facilityId: event.facilityId,
      facilityAreaId: event.facilityAreaId,
      pestSpecies: event.pestSpecies,
      infestedPct,
      threshold,
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

  const threshold = await getSpeciesThreshold(organizationId, event.pestSpecies);
  const allBelowThreshold = sessions.every((s) => {
    if (!s.sampleSize) return false;
    return ((s.pestCount ?? 0) / s.sampleSize) * 100 < threshold;
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
  baselinePct: number;
  latestPct: number;
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
// scouting alerts. "Meaningful decline" is a >=25% relative drop in
// infested % -- a deliberately loose bar so normal noisy fluctuation
// doesn't get flagged, only a treatment that's genuinely not working.
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
    if (!latest.sampleSize) continue;
    const latestPct = ((latest.pestCount ?? 0) / latest.sampleSize) * 100;

    // Baseline: whichever session sat closest to the treatment (last one
    // before it), falling back to the event's earliest session if the
    // treatment was applied before any monitoring happened.
    const preTreatment = sessions.filter((s) => s.createdAt.getTime() < lastTreatment.appliedAt.getTime());
    const baseline = preTreatment[0] ?? sessions[sessions.length - 1];
    if (!baseline || !baseline.sampleSize) continue;
    const baselinePct = ((baseline.pestCount ?? 0) / baseline.sampleSize) * 100;
    if (baselinePct <= 0) continue; // nothing to decline from

    const declinePct = ((baselinePct - latestPct) / baselinePct) * 100;
    if (declinePct >= MEANINGFUL_DECLINE_PCT) continue;

    alerts.push({
      eventId: event.id,
      facilityId: event.facilityId,
      facilityAreaId: event.facilityAreaId,
      pestSpecies: event.pestSpecies,
      daysSinceTreatment: Math.round(daysSinceTreatment),
      baselinePct: Math.round(baselinePct),
      latestPct: Math.round(latestPct),
      at: latest.createdAt,
    });
  }
  return alerts.sort((a, b) => b.at.getTime() - a.at.getTime());
}
