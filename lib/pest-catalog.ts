// Preset species/pest catalog -- transcribed from treatments.json's
// pests[] array (TREATMENTS.md's real seed data). Powers the species
// picker on pest/disease event creation (autocomplete + prefilled latin
// name) instead of pure freeform text, and is the source ThresholdEngine
// falls back to for a per-pest monitoring method hint (lib/threshold-
// engine.ts). "viroid" (HLVd) maps to kind "pathogen" -- the app's event
// model only distinguishes pest/pathogen, not a third viroid category, and
// HLVd's lab-test monitoring method genuinely doesn't fit the numeric
// ThresholdEngine (see monitoringMethod: null below) -- it's included
// here for the species picker only.
export type MonitoringMethod = "plant_sampling" | "sticky_trap" | "disease_assessment" | null;

export interface CatalogPest {
  id: string;
  commonName: string;
  latin: string;
  kind: "pest" | "pathogen";
  monitoringMethod: MonitoringMethod;
  exampleThreshold: string; // descriptive, human-readable -- not a parsed number, see lib/threshold-engine.ts
}

export const PEST_CATALOG: CatalogPest[] = [
  {
    id: "pest_tssm",
    commonName: "Two-spotted spider mites",
    latin: "Tetranychus urticae",
    kind: "pest",
    monitoringMethod: "plant_sampling",
    exampleThreshold: "action at >10-15% leaves infested or any active webbing",
  },
  {
    id: "pest_broadmite",
    commonName: "Broad / hemp russet mites",
    latin: "Polyphagotarsonemus latus / Aculops cannabicola",
    kind: "pest",
    monitoringMethod: "plant_sampling",
    exampleThreshold: "act on first distortion of new growth (mites often invisible)",
  },
  {
    id: "pest_thrips",
    commonName: "Thrips",
    latin: "Frankliniella occidentalis",
    kind: "pest",
    monitoringMethod: "sticky_trap",
    exampleThreshold: "act at rising trend / >5-10 per blue card per week (crop-dependent)",
  },
  {
    id: "pest_aphid",
    commonName: "Aphids",
    latin: "Myzus persicae / Phorodon cannabis",
    kind: "pest",
    monitoringMethod: "plant_sampling",
    exampleThreshold: "act on first colonies / >5-10% plants",
  },
  {
    id: "pest_whitefly",
    commonName: "Whiteflies",
    latin: "Trialeurodes vaporariorum / Bemisia tabaci",
    kind: "pest",
    monitoringMethod: "sticky_trap",
    exampleThreshold: "act on rising yellow-card catch / adults on tapping",
  },
  {
    id: "pest_fungusgnat",
    commonName: "Fungus gnats",
    latin: "Bradysia spp.",
    kind: "pest",
    monitoringMethod: "sticky_trap",
    exampleThreshold: "act on rising yellow-card adults / larvae in media",
  },
  {
    id: "pest_mealybug",
    commonName: "Mealybugs",
    latin: "Planococcus / Pseudococcus spp.",
    kind: "pest",
    monitoringMethod: "plant_sampling",
    exampleThreshold: "act on first colonies (leaf axils/stems)",
  },
  {
    id: "path_pm",
    commonName: "Powdery mildew",
    latin: "Golovinomyces / Podosphaera spp.",
    kind: "pathogen",
    monitoringMethod: "disease_assessment",
    exampleThreshold: "act on first colonies; scout weekly, more in high-humidity spells",
  },
  {
    id: "path_botrytis",
    commonName: "Botrytis / gray mold",
    latin: "Botrytis cinerea",
    kind: "pathogen",
    monitoringMethod: "disease_assessment",
    exampleThreshold: "scout dense buds in flower; act on first lesion",
  },
  {
    id: "path_rootrot",
    commonName: "Root rot complex (Pythium / Fusarium)",
    latin: "Pythium spp. / Fusarium spp.",
    kind: "pathogen",
    monitoringMethod: "disease_assessment",
    exampleThreshold: "act on wilting/browning roots, damping-off, slimy roots",
  },
  {
    id: "path_hlvd",
    commonName: "Hop latent viroid (HLVd)",
    latin: "HLVd",
    kind: "pathogen",
    monitoringMethod: null,
    exampleThreshold: "test mothers + symptomatic plants (stunting/brittle, 'dudding')",
  },
  {
    id: "pest_caterpillar",
    commonName: "Caterpillars / loopers (budworms, armyworms)",
    latin: "Spodoptera spp. / Trichoplusia ni / Helicoverpa spp.",
    kind: "pest",
    monitoringMethod: "plant_sampling",
    exampleThreshold: "act on first frass/entry-hole sighting -- damage is usually found before the caterpillar itself",
  },
  {
    id: "pest_rootaphid",
    commonName: "Root aphids",
    latin: "Rhopalosiphum spp. / Pemphigus spp.",
    kind: "pest",
    monitoringMethod: "plant_sampling",
    exampleThreshold: "act on first root-zone sighting in a wilting/stunted plant with no foliar pest signs",
  },
];
