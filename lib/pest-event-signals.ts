import { inArray } from "drizzle-orm";
import { db } from "@/db";
import { scoutingObservations, treatments } from "@/db/schema";

export interface EventSignal {
  lastTreatedAt: string | null;
  trend: "up" | "down" | "stable" | null;
}

// Feeds the map pin's secondary encodings (halo = recently treated, arrow =
// trend) -- both need history the pest_events row itself doesn't carry, so
// this batches it in two queries across every event on the map instead of
// querying per-pin (which would be a real N+1 once a facility has more than
// a couple hotspots).
export async function computeEventSignals(eventIds: string[]): Promise<Map<string, EventSignal>> {
  const result = new Map<string, EventSignal>();
  if (eventIds.length === 0) return result;

  const allTreatments = await db.select().from(treatments).where(inArray(treatments.pestEventId, eventIds));
  const lastTreatedMap = new Map<string, Date>();
  for (const t of allTreatments) {
    if (!t.pestEventId) continue;
    const prev = lastTreatedMap.get(t.pestEventId);
    if (!prev || t.appliedAt > prev) lastTreatedMap.set(t.pestEventId, t.appliedAt);
  }

  const sessions = await db
    .select()
    .from(scoutingObservations)
    .where(inArray(scoutingObservations.promotedPestEventId, eventIds));
  const sessionsByEvent = new Map<string, typeof sessions>();
  for (const s of sessions) {
    if (!s.promotedPestEventId) continue;
    sessionsByEvent.set(s.promotedPestEventId, [...(sessionsByEvent.get(s.promotedPestEventId) ?? []), s]);
  }

  for (const id of eventIds) {
    const evSessions = (sessionsByEvent.get(id) ?? []).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    let trend: EventSignal["trend"] = null;
    if (evSessions.length >= 2) {
      const latest = evSessions[evSessions.length - 1];
      const prior = evSessions[evSessions.length - 2];
      const latestDensity = latest.sampleSize ? (latest.pestCount ?? 0) / latest.sampleSize : null;
      const priorDensity = prior.sampleSize ? (prior.pestCount ?? 0) / prior.sampleSize : null;
      if (latestDensity != null && priorDensity != null) {
        trend = latestDensity > priorDensity ? "up" : latestDensity < priorDensity ? "down" : "stable";
      }
    }
    const treatedAt = lastTreatedMap.get(id);
    result.set(id, { lastTreatedAt: treatedAt ? treatedAt.toISOString() : null, trend });
  }
  return result;
}
