import { nearestZoneLabel, type Zone } from "@/lib/map-zones";

// Canvas-space (900x600, the same space the real Konva map and stored
// pest_events x/y already use) positions of the 20 generic "bay" slots
// (a stand-in layout shared by every facility, not that facility's actual
// floor plan). Single source of truth for both LocationPlacement
// (tap-to-place, writes an event's x/y from a bay) and PressureBayMap
// (colors a bay's bar by finding which real events are nearest to it) --
// so "Bay A3" means the exact same physical point in both places, not two
// independently-eyeballed layouts that can drift apart.
export const CANVAS_W = 900;
export const CANVAS_H = 600;

// Source layout: a 296x400 bench-grid viewBox (LocationPlacement's visual
// arrangement). Canvas positions below are derived from it once, here --
// everything else works from the canvas coordinates, not this viewBox.
const VIEW_W = 296;
const VIEW_H = 400;
const BENCH_W = 86;
const BENCH_H = 9;
const BENCH_YS = [34, 66, 98, 130, 162, 194, 226, 258, 290, 322];
const ROW_X = { A: 50, B: 160 } as const;

export interface Bay {
  row: "A" | "B";
  index: number; // 1-based within the row
  x: number; // canvas-space, 0-900
  y: number; // canvas-space, 0-600
}

export const BAYS: Bay[] = (["A", "B"] as const).flatMap((row) =>
  BENCH_YS.map((benchY, i) => {
    const cx = ROW_X[row] + BENCH_W / 2;
    const cy = benchY + BENCH_H / 2;
    return { row, index: i + 1, x: (cx / VIEW_W) * CANVAS_W, y: (cy / VIEW_H) * CANVAS_H };
  })
);

export function nearestBay(x: number, y: number): Bay {
  let best = BAYS[0];
  let bestDist = Infinity;
  for (const bay of BAYS) {
    const d = (bay.x - x) ** 2 + (bay.y - y) ** 2;
    if (d < bestDist) {
      bestDist = d;
      best = bay;
    }
  }
  return best;
}

export function bayLabel(bay: Pick<Bay, "row" | "index">): string {
  return `Bay ${bay.row}${bay.index}`;
}

// Shared fallback for "where is this" labels once a pin's x/y is known to be
// missing -- ticket found in a manager-persona walkthrough (2026-08-27):
// several call sites fell back to the pest's own species name instead of a
// real location, producing visibly duplicated text like task title
// "Hotspot monitoring: Whitefly — Whitefly". app/api/facilities/[id]/areas/[areaId]/
// scouting/route.ts already had this right (falls back to the area name);
// this just gives the other call sites the same correct fallback instead of
// each re-deriving (or mis-deriving) their own. areaName itself can be null
// (an event with no facilityAreaId at all) -- callers decide what to show
// then, since "Bay" vs a bare fallback reads differently in a title vs a
// detail line.
// `zones` is optional and additive: a caller that already has the area's
// real facilityMapObjects loaded (lib/map-zones.ts) gets a real label
// ("Bench 3", "Zone A") instead of the generic "Bay A1" whenever the area
// has been laid out; every existing caller that doesn't pass zones keeps
// its exact prior behavior (ticket recwOKlHCcSyXb971 -- the generic label
// was the ONLY thing shown on a re-entry restriction warning, with no way
// to match it to a real physical location).
export function locationLabel(x: number | null, y: number | null, areaName: string | null, zones?: Zone[]): string | null {
  if (x != null && y != null) {
    const real = zones?.length ? nearestZoneLabel(x, y, zones) : null;
    return real ?? bayLabel(nearestBay(x, y));
  }
  return areaName;
}
