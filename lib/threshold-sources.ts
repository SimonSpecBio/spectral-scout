import { findPestProgram } from "./treatments-catalog";

// Every competitor's marketing claims "AI-powered precision" without
// showing its work. This is the opposite: the actual sourcing (or explicit
// absence of a real number) behind each species' monitoring threshold,
// condensed from the pest-research handoff (monitoring_thresholds_seed.json,
// 2026-08-21) into something short enough to show inline next to the
// number itself. Costs almost nothing since the research already exists --
// the only new work is not hiding it.
export type ThresholdConfidence = "medium" | "low" | "n/a";

export interface ThresholdSource {
  confidence: ThresholdConfidence;
  basis: string;
  sourceUrl: string;
}

// Keyed by PestProgram.id (lib/treatments-catalog.ts) rather than species
// name, so a future catalog rename can't silently break this lookup.
const THRESHOLD_SOURCES: Record<string, ThresholdSource> = {
  pest_tssm: {
    confidence: "medium",
    basis: "Greenhouse-native (Rutgers, ivy geranium) mature-crop figure -- no published cannabis-specific threshold exists, and Scout has no crop-stage field to use the source's younger-crop number too.",
    sourceUrl: "https://plant-pest-advisory.rutgers.edu/pest-counts-action-thresholds-in-the-greenhouse/",
  },
  pest_broadmite: {
    confidence: "low",
    basis: "No threshold research exists for this pest on hemp/cannabis -- damage is often irreversible by the time it's visible, so the generic default is a placeholder, not a real number.",
    sourceUrl: "https://content.ces.ncsu.edu/hemp-russet-mite-in-industrial-hemp",
  },
  pest_thrips: {
    confidence: "n/a",
    basis: "Published thresholds are per-flower or sticky-card counts, not per-leaf -- this species is better tracked via the sticky-trap flow than the leaf grid.",
    sourceUrl: "https://www.ars.usda.gov/ARSUserFiles/11884/2012_Reitz_Funderburk_01.pdf",
  },
  pest_aphid: {
    confidence: "low",
    basis: "UC IPM: 'treatment thresholds for green peach aphid are not well established' -- damage (virus transmission, honeydew) is disproportionate to raw count.",
    sourceUrl: "https://ipm.ucanr.edu/agriculture/peppers/green-peach-aphid/",
  },
  pest_whitefly: {
    confidence: "low",
    basis: "UC IPM: 'Thresholds have not yet been established for greenhouse whitefly' -- the nearest per-leaf figures found (field tomato) disagree with each other by 4x, so no single number is defensible.",
    sourceUrl: "https://ipm.ucanr.edu/agriculture/tomato/greenhouse-whitefly/",
  },
  pest_fungusgnat: {
    confidence: "n/a",
    basis: "This is a growing-media/root-zone pest -- documented thresholds use soil-bait traps or sticky-card catch, never a leaf count.",
    sourceUrl: "https://plant-pest-advisory.rutgers.edu/pest-counts-action-thresholds-in-the-greenhouse/",
  },
  pest_mealybug: {
    confidence: "low",
    basis: "No numeric threshold documented anywhere found -- industry practice is treat-at-first-detection given how hard established colonies are to eradicate.",
    sourceUrl: "https://ipm.ucanr.edu/agriculture/floriculture-and-ornamental-nurseries/establishing-treatment-thresholds/",
  },
  path_pm: {
    confidence: "medium",
    basis: "Cucurbit-crop analog (Cornell) -- cannabis-industry convention leans stricter (closer to zero-tolerance) than this number.",
    sourceUrl: "https://www.vegetables.cornell.edu/pest-management/disease-factsheets/cucurbit-powdery-mildew/",
  },
  path_botrytis: {
    confidence: "low",
    basis: "No numeric threshold exists -- this is fundamentally an environmental/sanitation problem; industry convention is any visible sporulation triggers immediate action.",
    sourceUrl: "https://plant-pest-advisory.rutgers.edu/",
  },
  path_rootrot: {
    confidence: "low",
    basis: "Not a leaf-countable pathogen -- detected by above-ground symptoms or root inspection, not leaf sampling. No numeric leaf-based threshold applies.",
    sourceUrl: "https://extension.usu.edu/",
  },
};

export function thresholdSourceFor(pestSpecies: string): ThresholdSource | null {
  const program = findPestProgram(pestSpecies);
  if (!program) return null;
  return THRESHOLD_SOURCES[program.id] ?? null;
}
