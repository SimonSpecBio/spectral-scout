import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db";
import { facilities, facilityAreas, scoutingObservations } from "@/db/schema";
import { DEFAULT_DENSITY_THRESHOLD, DEFAULT_INFESTED_PCT_THRESHOLD, sessionMetric, type MetricKind } from "@/lib/threshold-engine";

export interface ScoutingAlert {
  observationId: string;
  facilityId: string;
  facilityAreaId: string;
  metricKind: MetricKind;
  value: number;
  threshold: number;
  at: Date;
  // Carried over so confirming into a New Pest Event doesn't make the
  // grower re-enter what was already observed -- the dropped pin (may be
  // null, same as any general session, see scout_observation's comment)
  // and the raw tally behind value.
  x: number | null;
  y: number | null;
  sampleSize: number;
  pestCount: number;
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
// defaults only (no per-species override makes sense without a species) --
// which default depends on sessionMetric's read of this particular
// session (occupancy % for a leaf-grid walk, density for a Counts tally).
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
    const facilityId = facilityIdByArea.get(s.facilityAreaId);
    if (!facilityId) continue;
    const metric = sessionMetric(s);
    if (!metric) continue;
    const threshold = metric.kind === "occupancy" ? DEFAULT_INFESTED_PCT_THRESHOLD : DEFAULT_DENSITY_THRESHOLD;
    if (metric.value < threshold) continue;

    alerts.push({
      observationId: s.id,
      facilityId,
      facilityAreaId: s.facilityAreaId,
      metricKind: metric.kind,
      value: metric.value,
      threshold,
      at: s.createdAt,
      x: s.x,
      y: s.y,
      sampleSize: s.sampleSize!,
      pestCount: s.pestCount ?? 0,
    });
  }
  return alerts.sort((a, b) => b.at.getTime() - a.at.getTime());
}

// Shared by the dashboard's Attention Required card and the Notifications
// feed so the two confirm links can't drift apart. Just the ids -- New
// Pest Event re-reads the observation row itself (ownership-verified
// there) for the dropped pin and raw tally rather than trusting URL
// params for that data, so passing them here would be redundant. Linking
// observationId is what lets New Pest Event set this session as the new
// event's first monitoring session instead of leaving it stranded
// unpromoted, which would otherwise keep re-alerting on the same data
// forever. Only the species is left for the grower to fill in.
export function scoutingAlertConfirmHref(a: ScoutingAlert): string {
  return `/app/new-event?facility=${a.facilityId}&area=${a.facilityAreaId}&observationId=${a.observationId}`;
}
