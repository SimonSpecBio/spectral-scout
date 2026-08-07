import { and, desc, eq, gte } from "drizzle-orm";
import { db } from "@/db";
import { inventoryItems, treatments } from "@/db/schema";
import { bayLabel, nearestBay } from "@/lib/floorplan-bays";

const DAY_MS = 86_400_000;
const LOOKBACK_DAYS = 30; // longer than any realistic PHI in the catalog (max 28d), short of that a treatment is just historical

export interface RestrictionEntry {
  treatmentId: string;
  bay: string;
  product: string;
  appliedAt: Date;
  reiHours: number | null;
  phiDays: number | null;
  reiEndsAt: Date | null;
  phiEndsAt: Date | null;
  reiActive: boolean;
  phiActive: boolean;
}

// Live-computed re-entry/pre-harvest restrictions per bay (11_rei_phi.svg)
// -- "Chemical treatments additionally create the REI/PHI restriction ...
// and block entry/harvest-type tasks on that bay until cleared"
// (SCHEDULING.md). Nothing is persisted as a separate "restriction" row;
// it's derived from appliedAt + the item's reiHours/phiDays every time this
// is called, same spirit as trap alerts and task overdue status -- never
// stale, no separate lifecycle to keep in sync.
export async function computeRestrictions(facilityId: string): Promise<RestrictionEntry[]> {
  const since = new Date(Date.now() - LOOKBACK_DAYS * DAY_MS);
  const rows = await db
    .select({ treatment: treatments, item: inventoryItems })
    .from(treatments)
    .innerJoin(inventoryItems, eq(treatments.inventoryItemId, inventoryItems.id))
    .where(and(eq(treatments.facilityId, facilityId), gte(treatments.appliedAt, since)))
    .orderBy(desc(treatments.appliedAt));

  const now = Date.now();
  return rows
    .filter((r) => r.treatment.x != null && r.treatment.y != null)
    .map((r) => {
      const { treatment: t, item } = r;
      const reiEndsAt = item.reiHours != null ? new Date(t.appliedAt.getTime() + item.reiHours * 3_600_000) : null;
      const phiEndsAt = item.phiDays != null ? new Date(t.appliedAt.getTime() + item.phiDays * DAY_MS) : null;
      return {
        treatmentId: t.id,
        bay: bayLabel(nearestBay(t.x!, t.y!)),
        product: item.name,
        appliedAt: t.appliedAt,
        reiHours: item.reiHours,
        phiDays: item.phiDays,
        reiEndsAt,
        phiEndsAt,
        reiActive: !!reiEndsAt && reiEndsAt.getTime() > now,
        phiActive: !!phiEndsAt && phiEndsAt.getTime() > now,
      };
    });
}
