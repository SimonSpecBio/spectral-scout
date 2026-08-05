// Ported from spectral-pilot/lib/density.ts's leaf-scouting model -- same
// grid, same aggregation, so the two apps' monitoring data means the same
// thing. A scout checks 10 plants x {top, middle, bottom} leaf; each leaf is
// absent or present-with-severity. Primary metric is % of checked leaves
// infested (not a raw pest count), trended against the org's own first
// session for this pest event/area.

export type LeafState = "unchecked" | "absent" | "low" | "medium" | "high";
export type PlantLeaves = [LeafState, LeafState, LeafState];
export type EstDensity = "None" | "Light" | "Medium" | "Heavy";

export interface ScoutAggregate {
  leavesChecked: number;
  leavesInfested: number;
  sevLow: number;
  sevMedium: number;
  sevHigh: number;
  infestedPct: number; // 0-100, infested / checked
  estDensity: EstDensity;
}

const CHECKED = new Set<LeafState>(["absent", "low", "medium", "high"]);

export function emptyLeafGrid(): PlantLeaves[] {
  return Array.from({ length: 10 }, () => ["unchecked", "unchecked", "unchecked"] as PlantLeaves);
}

export function estDensityFromPct(pct: number): EstDensity {
  if (pct >= 50) return "Heavy";
  if (pct >= 33) return "Medium";
  if (pct > 0) return "Light";
  return "None";
}

// Server-authoritative: recompute aggregates from the raw grid rather than
// trusting numbers the client sent.
export function aggregateLeafGrid(grid: PlantLeaves[]): ScoutAggregate {
  const flat = grid.flat();
  const checked = flat.filter((s) => CHECKED.has(s)).length;
  const low = flat.filter((s) => s === "low").length;
  const medium = flat.filter((s) => s === "medium").length;
  const high = flat.filter((s) => s === "high").length;
  const infested = low + medium + high;
  const infestedPct = checked > 0 ? Math.round((infested / checked) * 100) : 0;
  return {
    leavesChecked: checked,
    leavesInfested: infested,
    sevLow: low,
    sevMedium: medium,
    sevHigh: high,
    infestedPct,
    estDensity: estDensityFromPct(infestedPct),
  };
}
