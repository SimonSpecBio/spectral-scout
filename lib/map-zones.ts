// Pure, DB-free geometry helpers for facilityMapObjects (db/schema.ts) --
// same canvas-space (900x600) MapEditor.tsx and pest_events x/y already
// share. Split out here (not left inline in MapEditor.tsx) so anything
// that needs "which real, grower-named zone does this point belong to" --
// LocationPicker's live label preview, lib/rei-phi.ts's REI/PHI bay
// labels -- can answer that the same way MapEditor's own hotspot coloring
// does, instead of falling back to lib/floorplan-bays.ts's generic
// "Bay A1" grid (Airtable ticket recwOKlHCcSyXb971 -- that generic label
// was the ONLY thing shown on a re-entry restriction warning, with no way
// to match it to a real physical bay/bench/zone).

export type ZoneShapeType = "rect" | "circle" | "polygon" | "line" | "label";

export interface ZoneGeometry {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  radius?: number;
  points?: number[];
  rotation?: number;
}

export interface Zone {
  id: string;
  label: string;
  shapeType: ZoneShapeType;
  geometry: ZoneGeometry;
}

// Ported from MapEditor.tsx's local hotspotSeverity helper -- rotation is
// deliberately ignored for rect (same simplification that function already
// made), since a rotated zone is rare and an axis-aligned bounding check is
// a reasonable approximation for "which zone is this point roughly in."
export function pointInShape(px: number, py: number, shapeType: ZoneShapeType, g: ZoneGeometry): boolean {
  if (shapeType === "rect") {
    const x0 = Math.min(g.x ?? 0, (g.x ?? 0) + (g.width ?? 0));
    const x1 = Math.max(g.x ?? 0, (g.x ?? 0) + (g.width ?? 0));
    const y0 = Math.min(g.y ?? 0, (g.y ?? 0) + (g.height ?? 0));
    const y1 = Math.max(g.y ?? 0, (g.y ?? 0) + (g.height ?? 0));
    return px >= x0 && px <= x1 && py >= y0 && py <= y1;
  }
  if (shapeType === "circle") {
    const dx = px - (g.x ?? 0);
    const dy = py - (g.y ?? 0);
    return Math.sqrt(dx * dx + dy * dy) <= (g.radius ?? 0);
  }
  if (shapeType === "polygon" && g.points) {
    let inside = false;
    const pts = g.points;
    for (let i = 0, j = pts.length / 2 - 1; i < pts.length / 2; j = i++) {
      const xi = pts[i * 2];
      const yi = pts[i * 2 + 1];
      const xj = pts[j * 2];
      const yj = pts[j * 2 + 1];
      if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }
  return false;
}

// A representative point for a shape -- rect/circle center, polygon
// centroid. Lines and standalone label/text objects aren't real "areas" a
// point can be inside of, so they have no centroid here and are excluded
// from zone lookups entirely (nothing to click into on a map, nothing to
// meaningfully be "nearest" to).
export function centroidOf(shapeType: ZoneShapeType, g: ZoneGeometry): { x: number; y: number } | null {
  if (shapeType === "rect") return { x: (g.x ?? 0) + (g.width ?? 0) / 2, y: (g.y ?? 0) + (g.height ?? 0) / 2 };
  if (shapeType === "circle") return { x: g.x ?? 0, y: g.y ?? 0 };
  if (shapeType === "polygon" && g.points && g.points.length >= 2) {
    const n = g.points.length / 2;
    const cx = g.points.filter((_, i) => i % 2 === 0).reduce((a, b) => a + b, 0) / n;
    const cy = g.points.filter((_, i) => i % 2 === 1).reduce((a, b) => a + b, 0) / n;
    return { x: cx, y: cy };
  }
  return null;
}

// A standalone treatment (db/schema.ts's treatments.x/y comment) has no
// facilityAreaId -- only facility + x/y, and each of the facility's areas
// has its own independent 900x600 canvas, so the same (x, y) is a different
// physical point in every area. Nearest-zone guessing (nearestZoneLabel's
// fallback half) would silently pick a real-looking label in the WRONG
// area's geometry -- containment is the only signal trustworthy enough to
// cross areas with. Returns a label only when exactly one area's zone
// actually contains the point; null for zero matches (nothing drawn there)
// or more than one (genuinely ambiguous which area this point belongs to)
// -- both cases are the caller's cue to show an explicit "can't resolve
// this" fallback rather than a real-looking name that might be wrong.
export function resolveZoneAcrossAreas(x: number, y: number, areasWithZones: { areaId: string; zones: Zone[] }[]): string | null {
  const matches: string[] = [];
  for (const { zones } of areasWithZones) {
    const hit = zones.find((z) => z.label && pointInShape(x, y, z.shapeType, z.geometry));
    if (hit) matches.push(hit.label);
  }
  return matches.length === 1 ? matches[0] : null;
}

// The real-zone equivalent of lib/floorplan-bays.ts's bayLabel(nearestBay(...)):
// the label of whichever zone's actual shape contains the point, or --
// nothing contains it exactly (a pin dropped just outside a drawn zone's
// edge) -- the nearest zone by centroid distance instead of giving up.
// Returns null only when `zones` itself is empty (the area was never laid
// out), so callers know to fall back to the generic grid.
export function nearestZoneLabel(x: number, y: number, zones: Zone[]): string | null {
  const placeable = zones.filter((z) => z.label && centroidOf(z.shapeType, z.geometry));
  if (placeable.length === 0) return null;

  const contains = placeable.find((z) => pointInShape(x, y, z.shapeType, z.geometry));
  if (contains) return contains.label;

  let best = placeable[0];
  let bestDist = Infinity;
  for (const z of placeable) {
    const c = centroidOf(z.shapeType, z.geometry)!;
    const d = (c.x - x) ** 2 + (c.y - y) ** 2;
    if (d < bestDist) {
      bestDist = d;
      best = z;
    }
  }
  return best.label;
}
