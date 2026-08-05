import { deviceStatusEnum, plantHealthEnum } from "@/db/schema";

// Shared by both monitoring POST routes (event-scoped and general/unlinked)
// so the field extraction/validation isn't duplicated. Server-authoritative:
// this trusts sampleSize/pestCount as sent (the client already recomputed
// them from leafGrid via aggregateLeafGrid), but validates enum fields
// rather than trusting arbitrary strings.
export function parseMonitoringPayload(body: unknown) {
  const b = body as Record<string, unknown>;
  const sampleSize = typeof b.sampleSize === "number" ? b.sampleSize : null;
  const pestCount = typeof b.pestCount === "number" ? b.pestCount : null;
  if (sampleSize == null || pestCount == null) return null;

  return {
    sampleSize,
    pestCount,
    leafGrid: Array.isArray(b.leafGrid) ? b.leafGrid : null,
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
  };
}
