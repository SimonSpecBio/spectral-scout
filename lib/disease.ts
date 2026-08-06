// Disease/pathogen assessment model -- structurally parallel to
// lib/density.ts's pest leaf-check grid (same 10-plant x {bottom,middle,top}
// shape), but each cell is a percent-leaf-area severity CLASS instead of a
// presence/severity state, matching standard plant-pathology practice
// (assess % of leaf area affected, not just present/absent).

export type DiseaseClass = 0 | 1 | 2 | 3 | 4; // Clean / Trace / <25% / 25-50% / >50%
export type DiseaseCell = DiseaseClass | null; // null = not yet assessed
export type DiseaseLeaves = [DiseaseCell, DiseaseCell, DiseaseCell];

export const DISEASE_CLASS_LABELS = ["Clean", "Trace", "<25%", "25-50%", ">50%"] as const;

// Representative midpoint of each class's % leaf-area range, used to
// compute mean severity from ordinal classes -- the standard way to turn a
// severity-class scale into a numeric estimate (used since precisely
// measuring % leaf area per leaf isn't practical in the field). These are
// reasonable representative estimates, not pulled from one specific
// published scale.
export const DISEASE_CLASS_MIDPOINT: Record<DiseaseClass, number> = { 0: 0, 1: 2, 2: 12.5, 3: 37.5, 4: 75 };

export function emptyDiseaseGrid(): DiseaseLeaves[] {
  return Array.from({ length: 10 }, () => [null, null, null] as DiseaseLeaves);
}

export interface DiseaseAggregate {
  leavesAssessed: number;
  leavesInfected: number;
  incidencePct: number; // 0-100, infected / assessed
  meanSeverityPct: number; // 0-100, mean % leaf area across assessed leaves
}

export function aggregateDiseaseGrid(grid: DiseaseLeaves[]): DiseaseAggregate {
  const flat = grid.flat().filter((c): c is DiseaseClass => c !== null);
  const assessed = flat.length;
  const infected = flat.filter((c) => c > 0).length;
  const meanSeverityPct = assessed > 0 ? Math.round(flat.reduce((sum: number, c) => sum + DISEASE_CLASS_MIDPOINT[c], 0) / assessed) : 0;
  return {
    leavesAssessed: assessed,
    leavesInfected: infected,
    incidencePct: assessed > 0 ? Math.round((infected / assessed) * 100) : 0,
    meanSeverityPct,
  };
}

// Maps an initial assessment straight into the same severity enum every
// other part of the app (map pin size/color, badges, sort order) already
// reads -- so a disease event slots into the existing machinery with no
// special-casing anywhere else.
export function severityFromDiseaseAggregate(agg: DiseaseAggregate): "low" | "moderate" | "high" | "severe" {
  if (agg.meanSeverityPct >= 50 || agg.incidencePct >= 75) return "severe";
  if (agg.meanSeverityPct >= 25 || agg.incidencePct >= 50) return "high";
  if (agg.meanSeverityPct >= 10 || agg.incidencePct >= 25) return "moderate";
  return "low";
}
