import { eq } from "drizzle-orm";
import { db } from "@/db";
import { scoutingObservations } from "@/db/schema";
import { nearestBay } from "@/lib/floorplan-bays";

export interface BayLensStats {
  lastScoutedAt: Date | null;
  avgTempF: number | null;
  avgHumidityPct: number | null;
}

// Powers the dashboard map's Last scouted / Temp / Humidity lenses --
// every located scouting observation snaps to its nearest of the 20 shared
// bay slots (same `${row}${index}` key convention pest events use for the
// Pests lens, see PressureHeatmapPlaceholder), and each bay reports its
// most recent reading. A bay with no located observations yet just has no
// entry (rendered as idle by the caller), same as a bay with no pest event.
export async function computeBayLensStats(areaId: string): Promise<Map<string, BayLensStats>> {
  const rows = await db.select().from(scoutingObservations).where(eq(scoutingObservations.facilityAreaId, areaId));

  // Latest located row per bay -- picked in one pass by createdAt, then its
  // temp/humidity are read straight off that same row (may be null; a lens
  // value only ever comes from one visit, never mixed across visits).
  const latestByBay = new Map<string, (typeof rows)[number]>();
  for (const row of rows) {
    if (row.x == null || row.y == null) continue;
    const bay = nearestBay(row.x, row.y);
    const key = `${bay.row}${bay.index}`;
    const existing = latestByBay.get(key);
    if (!existing || row.createdAt > existing.createdAt) latestByBay.set(key, row);
  }

  const statsByBay = new Map<string, BayLensStats>();
  for (const [key, row] of latestByBay) {
    statsByBay.set(key, { lastScoutedAt: row.createdAt, avgTempF: row.avgTempF, avgHumidityPct: row.avgHumidityPct });
  }
  return statsByBay;
}
