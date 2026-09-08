import { and, desc, eq, gte, inArray, max } from "drizzle-orm";
import { db } from "@/db";
import { facilities, facilityAreas, facilityMapObjects, inventoryItems, pestEvents, treatments } from "@/db/schema";
import { locationLabel, nearestBay } from "@/lib/floorplan-bays";
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
// Floor only -- ticket recdC9gknN5CHcBE4: a fixed 30-day window (picked
// because the catalog's own max PHI is 28d) silently dropped any
// grower-entered custom product with a longer PHI/REI once its treatment
// aged past 30 days, reporting the bay harvest-clear while real days
// remained. lookbackDaysFor below widens this per-org to whatever the
// org's own inventory actually needs, using this only as the minimum for
// an org with nothing but ordinary catalog products.
const MIN_LOOKBACK_DAYS = 30;

// Pure half of lookbackDaysFor below -- split out (Phase 0.3, build-cycle
// doc 2026-09-07) so the actual decision math (does a 45-day PHI product
// correctly widen past the 30-day floor?) has a unit test that doesn't need
// a database. Never called with negative inputs in practice (phiDays/
// reiHours are non-negative columns), but Math.max/ceil handle it sanely
// either way.
export function computeLookbackDays(maxPhiDays: number, maxReiHours: number): number {
  const fromRei = Math.ceil(maxReiHours / 24);
  return Math.max(MIN_LOOKBACK_DAYS, maxPhiDays, fromRei) + 1;
}

// Derives how far back a restriction can still be "live" from the actual
// REI/PHI values in this org's inventory, rather than assuming the fixed
// 30-day floor covers every product a grower might enter by hand
// (app/api/inventory/route.ts now caps phiDays at 365 and reiHours at
// 8760 at write time, so this can never need to look back further than
// that regardless of what's stored).
async function lookbackDaysFor(facilityId: string): Promise<number> {
  const [facility] = await db.select({ organizationId: facilities.organizationId }).from(facilities).where(eq(facilities.id, facilityId));
  if (!facility) return MIN_LOOKBACK_DAYS;
  const [row] = await db
    .select({ maxPhiDays: max(inventoryItems.phiDays), maxReiHours: max(inventoryItems.reiHours) })
    .from(inventoryItems)
    .where(eq(inventoryItems.organizationId, facility.organizationId));
  return computeLookbackDays(row?.maxPhiDays ?? 0, row?.maxReiHours ?? 0);
}

// Pure half of the per-treatment REI/PHI window math inside computeRestrictions
// below -- split out for the same reason as computeLookbackDays. A null
// reiHours/phiDays (the product carries no restriction of that kind) must
// produce a null end date and an inactive flag, never a false restriction.
export function computeRestrictionWindow(
  appliedAt: Date,
  reiHours: number | null,
  phiDays: number | null,
  now: number = Date.now()
): { reiEndsAt: Date | null; phiEndsAt: Date | null; reiActive: boolean; phiActive: boolean } {
  const reiEndsAt = reiHours != null ? new Date(appliedAt.getTime() + reiHours * 3_600_000) : null;
  const phiEndsAt = phiDays != null ? new Date(appliedAt.getTime() + phiDays * DAY_MS) : null;
  return {
    reiEndsAt,
    phiEndsAt,
    reiActive: !!reiEndsAt && reiEndsAt.getTime() > now,
    phiActive: !!phiEndsAt && phiEndsAt.getTime() > now,
  };
}

// bayKey (not the display label) is the actual join key app/api/tasks/
// route.ts uses to decide whether a new task collides with a live
// restriction (ticket reclLv77FtmxbLHZr) -- display labels are for humans
// and change independently (a grower can rename a zone, or a facility can
// have real zones in one area and only the generic grid in another), so
// comparing them as strings to decide something meant the match silently
// stopped working the day real zone labels shipped. facilityAreaId is the
// other half of that key: a null-pin treatment (ticket recVRucXHLYwnnWhq)
// has no bayKey at all, only the area it happened in, and needs to still
// be comparable against a task that also has no specific pin.
export interface RestrictionEntry {
  treatmentId: string;
  bay: string;
  facilityAreaId: string | null;
  bayKey: string | null;
  product: string;
  appliedAt: Date;
  reiHours: number | null;
  phiDays: number | null;
  reiEndsAt: Date | null;
  phiEndsAt: Date | null;
  reiActive: boolean;
  phiActive: boolean;
}

interface ResolvedLocation {
  label: string;
  facilityAreaId: string | null;
  bayKey: string | null;
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
//
// x/y is no longer required to produce an entry (ticket recVRucXHLYwnnWhq):
// an event-scoped treatment with no pin still resolves to its event's real
// area, just without a specific bay within it -- missing location degrades
// the label to the area name, it never drops the row (this is only reachable
// for event-scoped treatments; the standalone POST route requires x/y).
// Shared by computeRestrictions and labelBiologicalReleases so the batch
// lookups only happen once per caller, not once per treatment.
async function resolveBayLabels(
  facilityId: string,
  rows: { id: string; pestEventId: string | null; x: number | null; y: number | null }[]
): Promise<Map<string, ResolvedLocation>> {
  const eventIds = [...new Set(rows.map((r) => r.pestEventId).filter((id): id is string => !!id))];
  const events = eventIds.length > 0 ? await db.select().from(pestEvents).where(inArray(pestEvents.id, eventIds)) : [];
  const areaByEventId = new Map(events.map((e) => [e.id, e.facilityAreaId]));

  // Every area in the facility, not just the ones an event happens to
  // reference -- a standalone treatment could land in any of them.
  const facilityAreaRows = await db.select().from(facilityAreas).where(eq(facilityAreas.facilityId, facilityId));
  const areaNameById = new Map(facilityAreaRows.map((a) => [a.id, a.name]));
  const areaIds = [...new Set([...facilityAreaRows.map((a) => a.id), ...events.map((e) => e.facilityAreaId).filter((id): id is string => !!id)])];
  const mapObjects = areaIds.length > 0 ? await db.select().from(facilityMapObjects).where(inArray(facilityMapObjects.facilityAreaId, areaIds)) : [];
  const zonesByAreaId = new Map<string, Zone[]>();
  for (const o of mapObjects) {
    if (!o.label || (o.shapeType !== "rect" && o.shapeType !== "circle" && o.shapeType !== "polygon")) continue;
    const zone: Zone = { id: o.id, label: o.label, shapeType: o.shapeType, geometry: o.geometry as Zone["geometry"] };
    zonesByAreaId.set(o.facilityAreaId, [...(zonesByAreaId.get(o.facilityAreaId) ?? []), zone]);
  }
  const allAreasWithZones = areaIds.map((areaId) => ({ areaId, zones: zonesByAreaId.get(areaId) ?? [] }));

  const resolved = new Map<string, ResolvedLocation>();
  for (const r of rows) {
    if (r.pestEventId) {
      const areaId = areaByEventId.get(r.pestEventId) ?? null;
      if (r.x == null || r.y == null) {
        // No pin -- degrade to the area name, don't drop the row. The area
        // itself is still the right (and only available) join key.
        resolved.set(r.id, { label: areaNameById.get(areaId ?? "") ?? "Unmapped bay", facilityAreaId: areaId, bayKey: null });
        continue;
      }
      const zones = areaId ? zonesByAreaId.get(areaId) : undefined;
      const bay = nearestBay(r.x, r.y);
      resolved.set(r.id, { label: locationLabel(r.x, r.y, null, zones)!, facilityAreaId: areaId, bayKey: `${bay.row}${bay.index}` });
    } else if (r.x != null && r.y != null) {
      // Standalone: no facilityAreaId to key on at all (by construction --
      // see the comment on treatments.x/y in db/schema.ts), so bayKey stays
      // null and this can only ever area-wide-match another standalone
      // treatment's exact same nowhere-to-match state, never a task (tasks
      // always have a facilityAreaId when they have any location at all).
      resolved.set(r.id, { label: resolveZoneAcrossAreas(r.x, r.y, allAreasWithZones) ?? UNRESOLVED_BAY_LABEL, facilityAreaId: null, bayKey: null });
    }
  }
  return resolved;
}

// Live-computed re-entry/pre-harvest restrictions per bay (11_rei_phi.svg)
// -- "Chemical treatments additionally create the REI/PHI restriction ...
// and block entry/harvest-type tasks on that bay until cleared"
// (SCHEDULING.md). Nothing is persisted as a separate "restriction" row;
// it's derived from appliedAt + the item's reiHours/phiDays every time this
// is called, same spirit as trap alerts and task overdue status -- never
// stale, no separate lifecycle to keep in sync.
export async function computeRestrictions(facilityId: string): Promise<RestrictionEntry[]> {
  const lookbackDays = await lookbackDaysFor(facilityId);
  const since = new Date(Date.now() - lookbackDays * DAY_MS);
  const rows = await db
    .select({ treatment: treatments, item: inventoryItems })
    .from(treatments)
    .innerJoin(inventoryItems, eq(treatments.inventoryItemId, inventoryItems.id))
    .where(and(eq(treatments.facilityId, facilityId), gte(treatments.appliedAt, since)))
    .orderBy(desc(treatments.appliedAt));

  // No longer filtered by x/y presence (ticket recVRucXHLYwnnWhq) -- a
  // treatment with no pin still needs its restriction to exist, just with
  // a degraded label. resolveBayLabels only ever fails to produce an entry
  // for a standalone treatment with no coordinates, which the create route
  // doesn't allow to exist in the first place.
  const locations = await resolveBayLabels(facilityId, rows.map((r) => r.treatment));

  const now = Date.now();
  return rows
    .filter((r) => locations.has(r.treatment.id))
    .map((r) => {
      const { treatment: t, item } = r;
      const location = locations.get(t.id)!;
      const window = computeRestrictionWindow(t.appliedAt, item.reiHours, item.phiDays, now);
      return {
        treatmentId: t.id,
        bay: location.label,
        facilityAreaId: location.facilityAreaId,
        bayKey: location.bayKey,
        product: item.name,
        appliedAt: t.appliedAt,
        reiHours: item.reiHours,
        phiDays: item.phiDays,
        ...window,
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

  const locations = await resolveBayLabels(facilityId, rows);
  return rows
    .filter((t) => locations.has(t.id))
    .map((t) => ({ id: t.id, bay: locations.get(t.id)!.label, product: t.product, appliedAt: t.appliedAt }));
}
