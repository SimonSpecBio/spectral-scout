import { eq } from "drizzle-orm";
import { db } from "@/db";
import { assessmentTypeEnum, deviceStatusEnum, plantHealthEnum, scoutingObservations } from "@/db/schema";
import { aggregateDiseaseGrid, type DiseaseLeaves } from "@/lib/disease";

// Shared by both monitoring POST routes (event-scoped and general/unlinked)
// so the field extraction/validation isn't duplicated. Server-authoritative:
// this trusts sampleSize/pestCount as sent (the client already recomputed
// them from leafGrid via aggregateLeafGrid/aggregateDiseaseGrid), but
// validates enum fields rather than trusting arbitrary strings.
export function parseMonitoringPayload(body: unknown) {
  const b = body as Record<string, unknown>;
  const sampleSize = typeof b.sampleSize === "number" ? b.sampleSize : null;
  const pestCount = typeof b.pestCount === "number" ? b.pestCount : null;
  if (sampleSize == null || pestCount == null) return null;

  const assessmentType = assessmentTypeEnum.enumValues.includes(b.assessmentType as never)
    ? (b.assessmentType as (typeof assessmentTypeEnum.enumValues)[number])
    : "pest_count";
  const leafGrid = Array.isArray(b.leafGrid) ? b.leafGrid : null;
  // Re-derived server-side from the grid rather than trusting a client-sent
  // number, same rule the disease-severity update in the event-scoped
  // monitoring route already follows for the event's own severity field.
  const meanSeverityPct = assessmentType === "disease_severity" && leafGrid ? aggregateDiseaseGrid(leafGrid as DiseaseLeaves[]).meanSeverityPct : null;

  return {
    sampleSize,
    pestCount,
    assessmentType,
    leafGrid,
    meanSeverityPct,
    avgTempF: typeof b.avgTempF === "number" ? b.avgTempF : null,
    avgHumidityPct: typeof b.avgHumidityPct === "number" ? b.avgHumidityPct : null,
    avgLightHrs: typeof b.avgLightHrs === "number" ? b.avgLightHrs : null,
    deviceStatus: deviceStatusEnum.enumValues.includes(b.deviceStatus as never)
      ? (b.deviceStatus as (typeof deviceStatusEnum.enumValues)[number])
      : null,
    plantHealthFlag: plantHealthEnum.enumValues.includes(b.plantHealthFlag as never)
      ? (b.plantHealthFlag as (typeof plantHealthEnum.enumValues)[number])
      : null,
    notes: typeof b.notes === "string" && b.notes ? b.notes : null,
    satisfactionRating: typeof b.satisfactionRating === "number" ? b.satisfactionRating : null,
    // Same clientRequestId dedup as pestEvents/treatments -- see
    // db/schema.ts's comment on scoutingObservations.clientRequestId
    // (product brief, 5 Sep 2026, Task 1.5).
    clientRequestId: typeof b.clientRequestId === "string" ? b.clientRequestId : null,
  };
}

// Shared by all three scoutingObservations insert sites (the event-scoped
// monitoring route, the general/unlinked scouting route, and pest-events'
// own initialMonitoring insert) so the replay-dedup logic lives in one
// place, same reasoning as lib/apply-treatment.ts's identical pattern for
// treatments. A retry replaying the same clientRequestId (a request that
// timed out client-side after actually committing, or two devices flushing
// the same queued item) returns the original row instead of creating a
// second one. isNew tells the caller whether to run this session's
// side effects (closing recheck tasks, auto-resolve, severity updates) --
// those must fire exactly once, on the genuinely new row, never again on a
// replayed one.
export async function insertScoutingObservation(
  values: typeof scoutingObservations.$inferInsert
): Promise<{ row: typeof scoutingObservations.$inferSelect; isNew: boolean }> {
  const insertQuery = db.insert(scoutingObservations).values(values);
  const [row] = values.clientRequestId
    ? await insertQuery.onConflictDoNothing({ target: scoutingObservations.clientRequestId }).returning()
    : await insertQuery.returning();
  if (row) return { row, isNew: true };

  const [existing] = await db.select().from(scoutingObservations).where(eq(scoutingObservations.clientRequestId, values.clientRequestId!));
  return { row: existing, isNew: false };
}
