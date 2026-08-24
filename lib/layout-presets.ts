// Geometry generators for the "no drawing required" area layouts
// (map-redesign-plan.md) -- Tier 1 of the map redesign. Every preset
// produces the same rect-shape zones the old freehand Konva editor could
// produce by hand, just computed instead of traced. Same 900x600 canvas
// space facilityMapObjects/MapEditor.tsx already use.
export const CANVAS_W = 900;
export const CANVAS_H = 600;
const PAD = 40;

export interface GeneratedZone {
  label: string;
  geometry: { x: number; y: number; width: number; height: number };
}

export function singleZone(label: string): GeneratedZone[] {
  return [{ label, geometry: { x: PAD, y: PAD, width: CANVAS_W - PAD * 2, height: CANVAS_H - PAD * 2 } }];
}

// Wraps a flat count of similar things (tents, bays, room zones) into rows
// of up to maxCols columns -- shared by every "N similar things" preset so
// the wrapping math lives in one place instead of copied per preset.
export function flowGrid(count: number, maxCols: number, labelFor: (i: number) => string): GeneratedZone[] {
  const n = Math.max(1, count);
  const cols = Math.min(maxCols, n);
  const rows = Math.ceil(n / cols);
  const cellW = (CANVAS_W - PAD * 2) / cols;
  const cellH = (CANVAS_H - PAD * 2) / rows;
  const zones: GeneratedZone[] = [];
  for (let i = 0; i < n; i++) {
    const r = Math.floor(i / cols);
    const c = i % cols;
    zones.push({
      label: labelFor(i),
      geometry: { x: PAD + c * cellW + cellW * 0.06, y: PAD + r * cellH + cellH * 0.06, width: cellW * 0.88, height: cellH * 0.88 },
    });
  }
  return zones;
}

// A real two-axis grid (e.g. rack tiers x sections, bench rows x columns) --
// distinct from flowGrid, which only wraps a flat count.
export function grid2d(rows: number, cols: number, labelFor: (r: number, c: number) => string): GeneratedZone[] {
  const r = Math.max(1, rows);
  const c = Math.max(1, cols);
  const cellW = (CANVAS_W - PAD * 2) / c;
  const cellH = (CANVAS_H - PAD * 2) / r;
  const zones: GeneratedZone[] = [];
  for (let ri = 0; ri < r; ri++) {
    for (let ci = 0; ci < c; ci++) {
      zones.push({
        label: labelFor(ri, ci),
        geometry: { x: PAD + ci * cellW + cellW * 0.06, y: PAD + ri * cellH + cellH * 0.06, width: cellW * 0.88, height: cellH * 0.88 },
      });
    }
  }
  return zones;
}
