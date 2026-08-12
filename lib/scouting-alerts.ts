import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db";
import { facilities, facilityAreas, scoutingObservations } from "@/db/schema";
import { DEFAULT_INFESTED_PCT_THRESHOLD } from "@/lib/threshold-engine";

export interface ScoutingAlert {
  observationId: string;
  facilityId: string;
  facilityAreaId: string;
  infestedPct: number;
  threshold: number;
  at: Date;
}

// The general/unlinked Scouting flow's counterpart to computeTrapAlerts and
// computeMonitoringAlerts -- a routine walkthrough (no pest event, no
// species picked yet, see scout_observation's schema comment on why: a
// scout logs a leaf tally, not a species ID) that comes back over
// threshold is a real signal too, not just event-linked sessions. Same
// "suggestion, never an auto-created event" rule as trap alerts (see that
// file's comment) -- no species is known here at all, so there's nothing
// to auto-create anyway; the confirm link hands off to New pest event with
// the site/area preset and lets the scout name what they found. Generic
// DEFAULT_INFESTED_PCT_THRESHOLD only (no per-species override makes sense
// without a species).
export async function computeScoutingAlerts(organizationId: string): Promise<ScoutingAlert[]> {
  const orgFacilities = await db.select().from(facilities).where(eq(facilities.organizationId, organizationId));
  if (orgFacilities.length === 0) return [];

  const orgAreas = await db
    .select()
    .from(facilityAreas)
    .where(
      inArray(
        facilityAreas.facilityId,
        orgFacilities.map((f) => f.id)
      )
    );
  if (orgAreas.length === 0) return [];
  const facilityIdByArea = new Map(orgAreas.map((a) => [a.id, a.facilityId]));

  const sessions = await db
    .select()
    .from(scoutingObservations)
    .where(and(inArray(scoutingObservations.facilityAreaId, orgAreas.map((a) => a.id)), isNull(scoutingObservations.promotedPestEventId)))
    .orderBy(desc(scoutingObservations.createdAt));

  // Latest general session per area, same "don't re-surface stale data"
  // rule as the other two alert computations.
  const latestByArea = new Map<string, (typeof sessions)[number]>();
  for (const s of sessions) {
    if (latestByArea.has(s.facilityAreaId)) continue;
    latestByArea.set(s.facilityAreaId, s);
  }

  const alerts: ScoutingAlert[] = [];
  for (const s of latestByArea.values()) {
    if (!s.sampleSize) continue;
    const facilityId = facilityIdByArea.get(s.facilityAreaId);
    if (!facilityId) continue;
    const infestedPct = Math.round(((s.pestCount ?? 0) / s.sampleSize) * 100);
    if (infestedPct < DEFAULT_INFESTED_PCT_THRESHOLD) continue;

    alerts.push({
      observationId: s.id,
      facilityId,
      facilityAreaId: s.facilityAreaId,
      infestedPct,
      threshold: DEFAULT_INFESTED_PCT_THRESHOLD,
      at: s.createdAt,
    });
  }
  return alerts.sort((a, b) => b.at.getTime() - a.at.getTime());
}
