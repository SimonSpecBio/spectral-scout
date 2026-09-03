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
  // links out to it and shows the PE-### code; Logs (13) doesn't use these.
  facilityId?: string;
  eventId?: string;
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

  const areas = await db.select().from(facilityAreas).where(inArray(facilityAreas.facilityId, facilityIds));
  const areaNameById = new Map(areas.map((a) => [a.id, a.name]));
  // Threads a monitoring session's own area back to its parent facility --
  // scoutingObservations only ever stores facilityAreaId, not facilityId
  // directly, which is why these entries never got a link before (ticket B8).
  const facilityIdByAreaId = new Map(areas.map((a) => [a.id, a.facilityId]));

  const [events, sessions, appliedTreatments, readings, orgTraps, doneTasks] = await Promise.all([
    db.select().from(pestEvents).where(inArray(pestEvents.facilityId, facilityIds)),
    db.select().from(scoutingObservations).where(eq(scoutingObservations.organizationId, organizationId)),
    db.select().from(treatments).where(inArray(treatments.facilityId, facilityIds)),
    db.select().from(trapReadings),
    db.select().from(traps).where(inArray(traps.facilityId, facilityIds)),
    db.select().from(tasks).where(eq(tasks.organizationId, organizationId)),
  ]);

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
    });
    if (e.resolvedAt) {
      entries.push({
        at: e.resolvedAt,
        kind: "event",
        label: `${displayNameForPestSpecies(e.pestSpecies)} resolved`,
        sub: loc.toUpperCase(),
        facilityId: e.facilityId,
        eventId: e.id,
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
