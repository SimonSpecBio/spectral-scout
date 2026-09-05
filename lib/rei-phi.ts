import { and, desc, eq, gte, inArray } from "drizzle-orm";
import { db } from "@/db";
import { facilityAreas, facilityMapObjects, inventoryItems, pestEvents, treatments } from "@/db/schema";
import { locationLabel } from "@/lib/floorplan-bays";
import { resolveZoneAcrossAreas, type Zone } from "@/lib/map-zones";

// Shown instead of a real bay/bench name when a standalone treatment's real
// zone can't be resolved (no zones drawn anywhere in the facility, or the
// point matches more than one area's geometry) -- deliberately NOT the
// generic bayLabel(nearestBay(...)) grid label, which reads exactly like a
// real name a grower could re-enter-safety-check against. This is the safety
// concern the parent ticket (recwOKlHCcSyXb971) was filed over: a wrong-
// looking real name is worse than an honest "we don't know."
const UNRESOLVED_BAY_LABEL = "Unmapped bay";

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

// A treatment carries no facilityAreaId of its own (db/schema.ts's
// treatments.x/y comment) -- an event-scoped one inherits its parent pest
// event's real area, which DOES have facilityMapObjects to check against.
// A standalone "Application log" treatment has no area context at all, so
// it's resolved by CONTAINMENT across every one of the facility's areas
// instead (resolveZoneAcrossAreas) -- the only way to safely cross areas'
// independent coordinate systems without risking a real-looking label from
// the wrong area's geometry (ticket recXwLtJ1c69xl7RA, extending
// recwOKlHCcSyXb971's event-scoped fix to standalone treatments too).
// Shared by computeRestrictions and labelBiologicalReleases so the batch
// lookups only happen once per caller, not once per treatment.
async function resolveBayLabels(
  facilityId: string,
  rows: { id: string; pestEventId: string | null; x: number | null; y: number | null }[]
): Promise<Map<string, string>> {
  const eventIds = [...new Set(rows.map((r) => r.pestEventId).filter((id): id is string => !!id))];
  const events = eventIds.length > 0 ? await db.select().from(pestEvents).where(inArray(pestEvents.id, eventIds)) : [];
  const areaByEventId = new Map(events.map((e) => [e.id, e.facilityAreaId]));

  // Every area in the facility, not just the ones an event happens to
  // reference -- a standalone treatment could land in any of them.
  const facilityAreaRows = await db.select().from(facilityAreas).where(eq(facilityAreas.facilityId, facilityId));
  const areaIds = [...new Set([...facilityAreaRows.map((a) => a.id), ...events.map((e) => e.facilityAreaId).filter((id): id is string => !!id)])];
  const mapObjects = areaIds.length > 0 ? await db.select().from(facilityMapObjects).where(inArray(facilityMapObjects.facilityAreaId, areaIds)) : [];
  const zonesByAreaId = new Map<string, Zone[]>();
  for (const o of mapObjects) {
    if (!o.label || (o.shapeType !== "rect" && o.shapeType !== "circle" && o.shapeType !== "polygon")) continue;
    const zone: Zone = { id: o.id, label: o.label, shapeType: o.shapeType, geometry: o.geometry as Zone["geometry"] };
    zonesByAreaId.set(o.facilityAreaId, [...(zonesByAreaId.get(o.facilityAreaId) ?? []), zone]);
  }
  const allAreasWithZones = areaIds.map((areaId) => ({ areaId, zones: zonesByAreaId.get(areaId) ?? [] }));

  const labels = new Map<string, string>();
  for (const r of rows) {
    if (r.x == null || r.y == null) continue;
    if (r.pestEventId) {
      const areaId = areaByEventId.get(r.pestEventId);
      const zones = areaId ? zonesByAreaId.get(areaId) : undefined;
      labels.set(r.id, locationLabel(r.x, r.y, null, zones)!);
    } else {
      labels.set(r.id, resolveZoneAcrossAreas(r.x, r.y, allAreasWithZones) ?? UNRESOLVED_BAY_LABEL);
    }
  }
  return labels;
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

  const filtered = rows.filter((r) => r.treatment.x != null && r.treatment.y != null);
  const bayLabels = await resolveBayLabels(facilityId, filtered.map((r) => r.treatment));

  const now = Date.now();
  return filtered.map((r) => {
    const { treatment: t, item } = r;
    const reiEndsAt = item.reiHours != null ? new Date(t.appliedAt.getTime() + item.reiHours * 3_600_000) : null;
    const phiEndsAt = item.phiDays != null ? new Date(t.appliedAt.getTime() + item.phiDays * DAY_MS) : null;
    return {
      treatmentId: t.id,
      bay: bayLabels.get(t.id)!,
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

export interface BiologicalRelease {
  id: string;
  bay: string;
  product: string | null;
  appliedAt: Date;
}

// /app/rei-phi's "Clear" list of recent biocontrol releases (no REI/PHI --
// biologicals never carry one) -- same real-bay-label fix as
// computeRestrictions, since this used the identical generic
// bayLabel(nearestBay(...)) call before.
export async function labelBiologicalReleases(facilityId: string, lookbackDays: number): Promise<BiologicalRelease[]> {
  const since = new Date(Date.now() - lookbackDays * DAY_MS);
  const rows = await db
    .select()
    .from(treatments)
    .where(and(eq(treatments.facilityId, facilityId), eq(treatments.type, "biological"), gte(treatments.appliedAt, since)))
    .orderBy(desc(treatments.appliedAt));

  const filtered = rows.filter((t) => t.x != null && t.y != null);
  const bayLabels = await resolveBayLabels(facilityId, filtered);
  return filtered.map((t) => ({ id: t.id, bay: bayLabels.get(t.id)!, product: t.product, appliedAt: t.appliedAt }));
}
