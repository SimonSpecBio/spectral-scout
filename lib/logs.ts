import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { facilities, facilityAreas, pestEvents, scoutingObservations, tasks, treatments, trapReadings, traps } from "@/db/schema";
import { metricLabel, sessionMetric } from "@/lib/threshold-engine";
import { displayNameForPestSpecies, displayNameForTreatmentType } from "@/lib/treatments-catalog";

// Simon's taxonomy decision (2026-09-03): every screen that categorizes
// activity uses the same three names -- Events, Treatments, Monitoring.
// Previously "finding" (pest) and "disease" were separate kinds, and a
// resolved event was lumped in with "action" (an applied treatment or a
// completed task) instead of counting as an Event. Now a pest OR disease
// detection AND its resolution are both "event"; an applied treatment or
// completed task is "treatment"; a scouting/trap session is "monitoring".
export type LogKind = "event" | "treatment" | "monitoring";
const KIND_COLOR: Record<LogKind, string> = { event: "#CE5D40", treatment: "#4E9E86", monitoring: "#4E6280" };
export { KIND_COLOR };

export interface LogEntry {
  at: Date;
  kind: LogKind;
  label: string;
  sub: string;
  // Set only for entries tied to one Pest/Disease Event -- Timeline (19)
  // links out to it and shows the CASE-###### code (lib/case-id.ts's
  // formatCaseId); Logs (13) doesn't use these.
  facilityId?: string;
  eventId?: string;
  caseNumber?: number | null;
  // Treatment entries only (Phase 1.5, build-cycle doc, 2026-09-07) --
  // extraction-only, same "present but unrendered by the Logs page itself"
  // convention as facilityId/eventId/caseNumber above. Consumed by the CSV
  // export's Dose/Stock Discrepancy columns.
  doseDetail?: string;
  stockWentNegative?: boolean;
}

// Same fields the case page's own Treatments list formats (PestEventDetail
// .tsx) -- duplicated rather than shared since that's a client component
// and this file pulls in @/db, which doesn't bundle for the browser.
function formatSpectralDose(t: {
  fixtureId: string | null;
  minutesAfterDark: number | null;
  durationMin: number | null;
  pulseCount: number | null;
}): string | undefined {
  const parts = [
    t.fixtureId,
    t.minutesAfterDark != null && `${t.minutesAfterDark}min after dark`,
    t.durationMin != null && `${t.durationMin}min duration`,
    t.pulseCount === 2 && "2 pulses",
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : undefined;
}

// A filterable, bay-keyed chronological record (13_logs_history.svg) --
// the compliance/crew-oversight audit trail, distinct from Timeline (19),
// which is a narrative activity feed. Pulls from every capture surface
// (events, scouting, treatments, trap readings, completed tasks) into one
// merged, sorted list rather than each screen keeping its own log.
export async function getOrgLogEntries(organizationId: string): Promise<LogEntry[]> {
  const orgFacilities = await db.select().from(facilities).where(eq(facilities.organizationId, organizationId));
  const facilityIds = orgFacilities.map((f) => f.id);
  if (facilityIds.length === 0) return [];
  const facilityNameById = new Map(orgFacilities.map((f) => [f.id, f.name]));

  const [areas, events, sessions, appliedTreatments, orgTraps, doneTasks] = await Promise.all([
    db.select().from(facilityAreas).where(inArray(facilityAreas.facilityId, facilityIds)),
    db.select().from(pestEvents).where(inArray(pestEvents.facilityId, facilityIds)),
    db.select().from(scoutingObservations).where(eq(scoutingObservations.organizationId, organizationId)),
    db.select().from(treatments).where(inArray(treatments.facilityId, facilityIds)),
    db.select().from(traps).where(inArray(traps.facilityId, facilityIds)),
    db.select().from(tasks).where(eq(tasks.organizationId, organizationId)),
  ]);
  const areaNameById = new Map(areas.map((a) => [a.id, a.name]));
  // Threads a monitoring session's own area back to its parent facility --
  // scoutingObservations only ever stores facilityAreaId, not facilityId
  // directly, which is why these entries never got a link before (ticket B8).
  const facilityIdByAreaId = new Map(areas.map((a) => [a.id, a.facilityId]));

  // trapReadings has no organizationId column of its own, only trapId --
  // scoping it means knowing this org's trap ids first, which is exactly
  // orgTraps' own result, so this can't join the batch above. Previously
  // fetched with no WHERE at all (every organization's trap readings, into
  // Node, on every Logs/Timeline load and CSV export), discarding
  // non-owned rows below only after the fact (Airtable ticket
  // rec5XjxiiN0UNKI65) -- not a data leak today since that JS filter was
  // correct, but exactly the pattern DB-level tenant isolation (RLS) would
  // otherwise catch, and this app connects with BYPASSRLS.
  const trapIds = orgTraps.map((t) => t.id);
  const readings = trapIds.length > 0 ? await db.select().from(trapReadings).where(inArray(trapReadings.trapId, trapIds)) : [];

  const trapById = new Map(orgTraps.map((t) => [t.id, t]));
  const eventById = new Map(events.map((e) => [e.id, e]));

  const entries: LogEntry[] = [];

  for (const e of events) {
    const loc = areaNameById.get(e.facilityAreaId ?? "") ?? facilityNameById.get(e.facilityId) ?? "";
    entries.push({
      at: e.createdAt,
      kind: "event",
      label: `${displayNameForPestSpecies(e.pestSpecies)} detected`,
      sub: loc.toUpperCase(),
      facilityId: e.facilityId,
      eventId: e.id,
      caseNumber: e.caseNumber,
    });
    if (e.resolvedAt) {
      entries.push({
        at: e.resolvedAt,
        kind: "event",
        label: `${displayNameForPestSpecies(e.pestSpecies)} resolved`,
        sub: loc.toUpperCase(),
        facilityId: e.facilityId,
        eventId: e.id,
        caseNumber: e.caseNumber,
      });
    }
  }

  for (const s of sessions) {
    const loc = areaNameById.get(s.facilityAreaId) ?? "";
    const metric = sessionMetric(s);
    entries.push({
      at: s.createdAt,
      kind: "monitoring",
      label: "Monitoring session",
      sub: [loc, metric ? metricLabel(metric) : null].filter(Boolean).join(" · ").toUpperCase(),
      facilityId: facilityIdByAreaId.get(s.facilityAreaId),
      // Only the sessions that promoted into a real Pest/Disease Event have
      // anywhere meaningful to link to beyond the facility itself -- most
      // routine sessions don't, and Timeline's own href logic falls back to
      // the facility page whenever eventId is absent.
      eventId: s.promotedPestEventId ?? undefined,
      caseNumber: s.promotedPestEventId ? (eventById.get(s.promotedPestEventId)?.caseNumber ?? null) : null,
    });
  }

  for (const t of appliedTreatments) {
    const event = t.pestEventId ? eventById.get(t.pestEventId) : null;
    const loc = event ? (areaNameById.get(event.facilityAreaId ?? "") ?? facilityNameById.get(event.facilityId)) : facilityNameById.get(t.facilityId);
    entries.push({
      at: t.appliedAt,
      kind: "treatment",
      label: `${t.product ?? displayNameForTreatmentType(t.type)} applied`,
      sub: (loc ?? "").toUpperCase(),
      facilityId: t.facilityId,
      eventId: t.pestEventId ?? undefined,
      caseNumber: event?.caseNumber ?? null,
      doseDetail: t.type === "spectral_light" ? formatSpectralDose(t) : undefined,
      stockWentNegative: t.stockWentNegative,
    });
  }

  const readingsByTrapDay = new Map<string, typeof readings>();
  for (const r of readings) {
    const trap = trapById.get(r.trapId);
    if (!trap) continue;
    const key = `${trap.facilityAreaId}::${r.createdAt.toDateString()}`;
    readingsByTrapDay.set(key, [...(readingsByTrapDay.get(key) ?? []), r]);
  }
  for (const group of readingsByTrapDay.values()) {
    const loc = areaNameById.get(trapById.get(group[0].trapId)?.facilityAreaId ?? "") ?? "";
    entries.push({ at: group[0].createdAt, kind: "monitoring", label: "Trap readings logged", sub: `${group.length} TRAPS · ${loc}`.toUpperCase() });
  }

  for (const t of doneTasks) {
    if (t.status !== "done" || !t.completedAt) continue;
    const loc = areaNameById.get(t.facilityAreaId ?? "") ?? facilityNameById.get(t.facilityId ?? "") ?? "";
    entries.push({ at: t.completedAt, kind: "treatment", label: t.title, sub: loc.toUpperCase() });
  }

  return entries.sort((a, b) => b.at.getTime() - a.at.getTime());
}
