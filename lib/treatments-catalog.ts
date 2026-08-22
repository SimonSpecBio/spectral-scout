// Full transcription of treatments.json (TREATMENTS.md's real seed data) --
// the knowledge base that turns a Pest Event into a recommended program +
// follow-up schedule (lib/recommendations.ts). Separate from
// lib/pest-catalog.ts (species picker) and lib/inventory-catalog.ts
// (Inventory's add-from-catalog list), which only needed subsets of this;
// this file carries the full program/followUp/targets graph those two
// don't.
//
// COMPLIANCE (TREATMENTS.md's disclaimer, still true here even pre-launch):
// several chemicalLastResort entries are restricted or outright prohibited
// on cannabis in many markets. No jurisdiction/crop approved-product-list
// gate exists yet -- restricted items are kept visually separated and
// explicitly labeled (never silently offered as equal to everything else),
// but this is not a substitute for that gate before this is public. Every
// entry here is representative IPM knowledge, not a prescription -- see
// TREATMENTS.md.
export interface Agent {
  id: string;
  name: string;
  role: string;
  targets: string[]; // pest ids
  typicalRate: string;
  reintroDays: number;
  notes: string;
}

export interface Product {
  id: string;
  name: string;
  class: string;
  type: string;
  targets: string[]; // pest ids
  reiHours: number;
  phiDays: number;
  cautions: string;
  restricted?: boolean; // chemicalLastResort tier -- cannabis-restricted in many markets
}

export interface PestProgram {
  id: string;
  commonName: string;
  latin: string;
  kind: "pest" | "pathogen";
  preventive: string[];
  primaryBiocontrol: string[]; // agent ids
  biopesticideRotation: string[]; // product ids
  cultural: string[];
  chemicalLastResort: string[]; // product ids
  followUp: { recheckDays: number; releaseIntervalDays: number; escalateIfNoDeclineDays: number } | null;
  cautions: string[];
  // Real, sourced per-species overrides for lib/threshold-engine.ts's
  // generic DEFAULT_DENSITY_THRESHOLD (3/leaf) and DEFAULT_INFESTED_PCT_THRESHOLD
  // (15%) -- from the pest-threshold research pass (2026-08-21), citing
  // UC IPM/extension sources per-pest (see each entry's comment). Omitted
  // entirely for species where that research found no defensible number
  // (aphids, broad/russet mite, thrips-on-leaves, mealybugs, root rot --
  // all explicitly "no threshold established" in the source extension
  // guidance), so those correctly keep falling back to the generic
  // defaults rather than a fabricated one.
  defaultDensityThreshold?: number;
  defaultOccupancyPctThreshold?: number;
}

export const AGENTS: Agent[] = [
  { id: "ag_persimilis", name: "Phytoseiulus persimilis", role: "specialist predatory mite", targets: ["pest_tssm"], typicalRate: "2-6 per infested plant, or 4-10 /m2 hotspot", reintroDays: 7, notes: "Best on active TSSM colonies; needs prey + humidity >60%." },
  { id: "ag_californicus", name: "Neoseiulus californicus", role: "generalist predatory mite", targets: ["pest_tssm", "pest_broadmite"], typicalRate: "2-5 /plant preventive", reintroDays: 14, notes: "More persistent at low prey/low humidity than persimilis." },
  { id: "ag_swirskii", name: "Amblyseius swirskii", role: "generalist predatory mite", targets: ["pest_thrips", "pest_whitefly", "pest_broadmite"], typicalRate: "sachets 1 per 1-2 plants, or 50-100 /m2", reintroDays: 21, notes: "Warm-climate (>20C). Sachets give slow release over weeks." },
  { id: "ag_cucumeris", name: "Neoseiulus cucumeris", role: "predatory mite", targets: ["pest_thrips", "pest_broadmite"], typicalRate: "sachets or 50-100 /m2", reintroDays: 21, notes: "Targets thrips larvae; slower/cooler tolerant than swirskii." },
  { id: "ag_andersoni", name: "Amblyseius andersoni", role: "predatory mite", targets: ["pest_tssm", "pest_broadmite"], typicalRate: "sachets 1 per plant", reintroDays: 28, notes: "Broad temperature tolerance; good early/preventive." },
  { id: "ag_orius", name: "Orius insidiosus", role: "minute pirate bug (predator)", targets: ["pest_thrips"], typicalRate: "0.5-2 /m2, focus flowering", reintroDays: 14, notes: "Eats thrips adults+larvae; needs pollen/prey; short daylength can diapause." },
  { id: "ag_feltiella", name: "Feltiella acarisuga", role: "predatory midge", targets: ["pest_tssm"], typicalRate: "supplemental to persimilis", reintroDays: 14, notes: "Finds hotspots well; humidity-dependent." },
  { id: "ag_aphidius_col", name: "Aphidius colemani", role: "parasitoid wasp", targets: ["pest_aphid"], typicalRate: "0.5-3 /m2; use banker plants", reintroDays: 7, notes: "For small aphids (green peach). A. ervi for larger aphids." },
  { id: "ag_aphidoletes", name: "Aphidoletes aphidimyza", role: "predatory midge", targets: ["pest_aphid"], typicalRate: "1-4 /m2 on hotspots", reintroDays: 7, notes: "Larvae eat aphids; adults need dark/humidity; can diapause short days." },
  { id: "ag_lacewing", name: "Chrysoperla carnea", role: "generalist predator (larvae)", targets: ["pest_aphid", "pest_mealybug", "pest_whitefly"], typicalRate: "5-10 larvae /m2 hotspot", reintroDays: 10, notes: "Voracious generalist; good clean-up on hotspots." },
  { id: "ag_encarsia", name: "Encarsia formosa", role: "parasitoid wasp", targets: ["pest_whitefly"], typicalRate: "cards 1-3 /m2 weekly", reintroDays: 7, notes: "Best on greenhouse whitefly (Trialeurodes); warm + good light." },
  { id: "ag_eretmocerus", name: "Eretmocerus eremicus", role: "parasitoid wasp", targets: ["pest_whitefly"], typicalRate: "cards 1-3 /m2 weekly", reintroDays: 7, notes: "Better on Bemisia and at higher temps; often mixed with Encarsia." },
  { id: "ag_delphastus", name: "Delphastus catalinae", role: "predatory beetle", targets: ["pest_whitefly"], typicalRate: "0.25-1 /m2 on hotspots", reintroDays: 14, notes: "Curative on heavy whitefly; eats eggs." },
  { id: "ag_stratiolaelaps", name: "Stratiolaelaps scimitus", role: "soil predatory mite", targets: ["pest_fungusgnat", "pest_thrips"], typicalRate: "125-250 /m2 media surface", reintroDays: 28, notes: "Eats fungus gnat larvae + thrips pupae in soil." },
  { id: "ag_steinernema", name: "Steinernema feltiae", role: "entomopathogenic nematode", targets: ["pest_fungusgnat", "pest_thrips"], typicalRate: "0.5M /m2 drench", reintroDays: 7, notes: "Media drench; keep media moist; reapply." },
  { id: "ag_dalotia", name: "Dalotia (Atheta) coriaria", role: "rove beetle", targets: ["pest_fungusgnat", "pest_thrips"], typicalRate: "establish colony on media", reintroDays: 28, notes: "Soil-dwelling generalist; good with Stratiolaelaps." },
  { id: "ag_cryptolaemus", name: "Cryptolaemus montrouzieri", role: "mealybug destroyer beetle", targets: ["pest_mealybug"], typicalRate: "1-5 /m2 on hotspots", reintroDays: 21, notes: "Curative on mealybug colonies; warm-loving." },
  { id: "ag_trichoderma", name: "Trichoderma harzianum/atroviride", role: "antagonistic fungus (root)", targets: ["path_rootrot"], typicalRate: "media inoculant per label", reintroDays: 30, notes: "Preventive root colonizer vs Pythium/Fusarium." },
  { id: "ag_clonostachys", name: "Clonostachys rosea", role: "antagonistic fungus (foliar/wound)", targets: ["path_botrytis"], typicalRate: "foliar per label", reintroDays: 14, notes: "Preventive vs Botrytis on senescing tissue/wounds." },
];

export const PRODUCTS: Product[] = [
  { id: "pr_insecticidal_soap", name: "Insecticidal soap (K-salts of fatty acids)", class: "soap", type: "biopesticide-minrisk", targets: ["pest_tssm", "pest_aphid", "pest_whitefly", "pest_mealybug", "pest_thrips"], reiHours: 0, phiDays: 0, cautions: "Contact only; coverage critical; can burn tender growth; incompatible with releasing beneficials same day." },
  { id: "pr_hort_oil", name: "Horticultural / neem oil", class: "oil", type: "biopesticide-minrisk", targets: ["pest_tssm", "pest_broadmite", "pest_whitefly", "pest_aphid", "path_pm"], reiHours: 4, phiDays: 0, cautions: "Do NOT combine or overlap with sulfur (~2wk). Avoid in heat/high light. Not in late flower (residue)." },
  { id: "pr_sulfur", name: "Sulfur (wettable / vaporizer burner)", class: "mineral", type: "biopesticide-minrisk", targets: ["path_pm", "pest_broadmite", "pest_tssm"], reiHours: 24, phiDays: 0, cautions: "NEVER with oils (2wk gap). Not in mid-late flower (taste/residue). Ventilate; respirator for burners. Phytotoxic in heat." },
  { id: "pr_kbicarb", name: "Potassium bicarbonate", class: "bicarbonate", type: "biopesticide-minrisk", targets: ["path_pm"], reiHours: 4, phiDays: 0, cautions: "Contact/curative-eradicant on PM; rotate to avoid residue; test small area." },
  { id: "pr_bacillus_sub", name: "Bacillus subtilis / amyloliquefaciens", class: "microbial-fungicide", type: "biopesticide", targets: ["path_pm", "path_botrytis"], reiHours: 4, phiDays: 0, cautions: "Preventive/early; needs good coverage and repeat." },
  { id: "pr_bti", name: "Bacillus thuringiensis israelensis (Bti)", class: "microbial-insecticide", type: "biopesticide", targets: ["pest_fungusgnat"], reiHours: 4, phiDays: 0, cautions: "Larval drench; reapply; pair with dry-back + nematodes." },
  { id: "pr_beauveria", name: "Beauveria bassiana", class: "entomopathogenic-fungus", type: "biopesticide", targets: ["pest_whitefly", "pest_thrips", "pest_aphid", "pest_tssm", "pest_mealybug"], reiHours: 4, phiDays: 0, cautions: "Needs humidity to infect; can harm some beneficials -- separate applications." },
  { id: "pr_isaria", name: "Cordyceps (Isaria) fumosorosea", class: "entomopathogenic-fungus", type: "biopesticide", targets: ["pest_whitefly", "pest_thrips", "pest_broadmite"], reiHours: 4, phiDays: 0, cautions: "As Beauveria; humidity-dependent." },
  { id: "pr_spinosad", name: "Spinosad", class: "spinosyn", type: "biopesticide-derived", targets: ["pest_thrips"], reiHours: 4, phiDays: 3, cautions: "Rotate/limited uses (resistance). Toxic to bees + some beneficials when wet. Check cannabis legality." },
  { id: "pr_abamectin", name: "Abamectin", class: "avermectin", type: "chemical", targets: ["pest_tssm", "pest_broadmite", "pest_thrips"], reiHours: 12, phiDays: 7, cautions: "RESTRICTED / often PROHIBITED on cannabis. Translaminar miticide. Resistance mgmt. Verify legality + label.", restricted: true },
  { id: "pr_flonicamid", name: "Flonicamid", class: "feeding-blocker", type: "chemical", targets: ["pest_aphid", "pest_whitefly"], reiHours: 12, phiDays: 7, cautions: "RESTRICTED on cannabis in many markets. Verify legality + label.", restricted: true },
  { id: "pr_h2o2", name: "Hydrogen peroxide / root-zone oxygenation", class: "oxidizer/cultural", type: "cultural", targets: ["path_rootrot"], reiHours: 0, phiDays: 0, cautions: "Root-zone sanitation in hydro; can harm beneficial microbes -- reinoculate." },
];

export const PESTS: PestProgram[] = [
  {
    id: "pest_tssm", commonName: "Two-spotted spider mite", latin: "Tetranychus urticae", kind: "pest",
    preventive: ["Scout undersides weekly (hand lens)", "Keep humidity up / avoid hot-dry stress", "Release ag_californicus or ag_andersoni preventively"],
    primaryBiocontrol: ["ag_persimilis", "ag_feltiella"],
    biopesticideRotation: ["pr_insecticidal_soap", "pr_hort_oil", "pr_beauveria"],
    cultural: ["Remove/bag heavily webbed leaves", "Spot-isolate hotspots"],
    chemicalLastResort: ["pr_abamectin"],
    followUp: { recheckDays: 5, releaseIntervalDays: 7, escalateIfNoDeclineDays: 14 },
    cautions: ["Explodes in hot/dry conditions", "If using sulfur/oil, do not release predators into residue"],
    // UC IPM Peppermint Pest Management Guidelines: ~5 mites/leaf action
    // threshold; 15/23 sampled leaves (~65%) showing any presence is the
    // documented occupancy-% equivalent. No cannabis-specific research
    // exists (NC State: "no research has been done"); this is the
    // best-documented ag-crop analog, high confidence.
    defaultDensityThreshold: 5,
    defaultOccupancyPctThreshold: 65,
  },
  {
    id: "pest_broadmite", commonName: "Broad / hemp russet mite", latin: "Polyphagotarsonemus latus / Aculops cannabicola", kind: "pest",
    preventive: ["Inspect new growth (30-60x scope)", "Quarantine incoming clones", "Preventive ag_swirskii / ag_andersoni"],
    primaryBiocontrol: ["ag_swirskii", "ag_cucumeris"],
    biopesticideRotation: ["pr_sulfur", "pr_hort_oil", "pr_isaria"],
    cultural: ["Cull severely distorted tips", "Isolate infested plants"],
    chemicalLastResort: ["pr_abamectin"],
    followUp: { recheckDays: 4, releaseIntervalDays: 7, escalateIfNoDeclineDays: 10 },
    cautions: ["Do not overlap sulfur and oils", "Symptoms lag population -- treat early and aggressively"],
  },
  {
    id: "pest_thrips", commonName: "Western flower thrips", latin: "Frankliniella occidentalis", kind: "pest",
    preventive: ["Blue sticky cards for monitoring", "Preventive ag_cucumeris / ag_swirskii sachets", "ag_steinernema or ag_stratiolaelaps for soil pupae"],
    primaryBiocontrol: ["ag_swirskii", "ag_orius", "ag_cucumeris"],
    biopesticideRotation: ["pr_beauveria", "pr_spinosad", "pr_insecticidal_soap"],
    cultural: ["Mass-trap with blue cards", "Remove weeds/flowering hosts"],
    chemicalLastResort: ["pr_abamectin", "pr_spinosad"],
    followUp: { recheckDays: 5, releaseIntervalDays: 7, escalateIfNoDeclineDays: 14 },
    cautions: ["Vectors viruses", "Spinosad: rotate, limited uses, harms beneficials when wet"],
  },
  {
    id: "pest_aphid", commonName: "Aphids (green peach / cannabis aphid)", latin: "Myzus persicae / Phorodon cannabis", kind: "pest",
    preventive: ["Yellow cards", "Banker plants for ag_aphidius_col", "Scout growing tips + undersides"],
    primaryBiocontrol: ["ag_aphidius_col", "ag_aphidoletes", "ag_lacewing"],
    biopesticideRotation: ["pr_insecticidal_soap", "pr_hort_oil", "pr_beauveria"],
    cultural: ["Squash/prune hotspot colonies", "Remove alate sources"],
    chemicalLastResort: ["pr_flonicamid"],
    followUp: { recheckDays: 4, releaseIntervalDays: 7, escalateIfNoDeclineDays: 12 },
    cautions: ["Cannabis aphid can be cryptic on stems", "Preserve mummies (parasitized aphids) -- don't spray over them"],
  },
  {
    id: "pest_whitefly", commonName: "Whitefly", latin: "Trialeurodes vaporariorum / Bemisia tabaci", kind: "pest",
    preventive: ["Yellow cards", "Preventive ag_encarsia / ag_swirskii", "Screen intakes; inspect clones"],
    primaryBiocontrol: ["ag_encarsia", "ag_eretmocerus", "ag_delphastus", "ag_swirskii"],
    biopesticideRotation: ["pr_beauveria", "pr_isaria", "pr_insecticidal_soap", "pr_hort_oil"],
    cultural: ["Remove heavily infested lower leaves", "Mass-trap"],
    chemicalLastResort: [],
    followUp: { recheckDays: 5, releaseIntervalDays: 7, escalateIfNoDeclineDays: 21 },
    cautions: ["Identify species -- parasitoid choice differs", "Remove yellow cards before big parasitoid releases"],
    // UC IPM/Naranjo et al. (field cotton, silverleaf whitefly): 10+
    // adults/leaf during early migration (peer-reviewed range tested at
    // 5-10/leaf for best economic return -- Simon confirmed 10 as the
    // number to use), 40% of leaves infested (>=3 adults/leaf) as the
    // occupancy equivalent. Field-cotton-derived, not greenhouse/cannabis-
    // specific -- medium confidence, closest documented analog found.
    defaultDensityThreshold: 10,
    defaultOccupancyPctThreshold: 40,
  },
  {
    id: "pest_fungusgnat", commonName: "Fungus gnats", latin: "Bradysia spp.", kind: "pest",
    preventive: ["Yellow cards at media level", "Avoid overwatering / allow dry-back", "Preventive ag_stratiolaelaps + ag_steinernema"],
    primaryBiocontrol: ["ag_stratiolaelaps", "ag_steinernema", "ag_dalotia"],
    biopesticideRotation: ["pr_bti"],
    cultural: ["Dry media surface", "Fix leaks/algae", "Cover drains"],
    chemicalLastResort: [],
    followUp: { recheckDays: 7, releaseIntervalDays: 7, escalateIfNoDeclineDays: 21 },
    cautions: ["Larvae damage roots + spread Pythium/Fusarium -- root-rot link"],
  },
  {
    id: "pest_mealybug", commonName: "Mealybugs", latin: "Planococcus / Pseudococcus spp.", kind: "pest",
    preventive: ["Inspect axils/nodes on incoming stock", "Quarantine clones"],
    primaryBiocontrol: ["ag_cryptolaemus", "ag_lacewing"],
    biopesticideRotation: ["pr_insecticidal_soap", "pr_hort_oil", "pr_beauveria"],
    cultural: ["Spot-treat colonies with 70% IPA on swab", "Prune infested tissue"],
    chemicalLastResort: [],
    followUp: { recheckDays: 7, releaseIntervalDays: 14, escalateIfNoDeclineDays: 28 },
    cautions: ["Waxy coating resists contact sprays -- coverage + repeat needed"],
  },
  {
    id: "path_pm", commonName: "Powdery mildew", latin: "Golovinomyces / Podosphaera spp.", kind: "pathogen",
    preventive: ["Airflow + VPD/humidity control", "Resistant genetics", "Preventive pr_bacillus_sub or pr_sulfur (veg only)"],
    primaryBiocontrol: [],
    biopesticideRotation: ["pr_kbicarb", "pr_bacillus_sub", "pr_sulfur", "pr_hort_oil"],
    cultural: ["Remove/bag infected leaves", "Increase spacing/airflow", "Lower RH"],
    chemicalLastResort: [],
    followUp: { recheckDays: 5, releaseIntervalDays: 7, escalateIfNoDeclineDays: 14 },
    cautions: ["No sulfur+oil overlap (2wk)", "No sulfur mid-late flower", "Rotate bicarbonate/Bacillus/sulfur for resistance"],
    // Cornell Vegetables (cucurbit powdery mildew): 1 of 50 older leaves
    // symptomatic (~2% incidence) triggers fungicide start -- closely
    // mirrors this app's 10-plant leaf-grid sampling design. No
    // cannabis-specific number exists; industry convention is "treat at
    // first visible sign" anyway, which this low threshold matches well.
    // No density figure -- PM isn't a countable-pest-per-leaf metric.
    defaultOccupancyPctThreshold: 2,
  },
  {
    id: "path_botrytis", commonName: "Botrytis / gray mold (bud rot)", latin: "Botrytis cinerea", kind: "pathogen",
    preventive: ["RH <50% in flower + airflow", "Defoliate/open canopy", "Preventive pr_bacillus_sub or ag_clonostachys"],
    primaryBiocontrol: ["ag_clonostachys"],
    biopesticideRotation: ["pr_bacillus_sub"],
    cultural: ["Remove + bag infected buds immediately (don't shake spores)", "Drop RH", "Increase airflow", "Reduce wounding"],
    chemicalLastResort: [],
    followUp: { recheckDays: 3, releaseIntervalDays: 7, escalateIfNoDeclineDays: 7 },
    cautions: ["Largely an environmental/sanitation problem -- climate control is primary", "Handle infected tissue gently to avoid spore release"],
    // Deliberately NO numeric threshold here, per the pest-research
    // handoff's explicit instruction (monitoring_thresholds_seed.json):
    // no authoritative number exists for botrytis, and forcing even a low
    // single-digit-% gate "would understate the urgency" for a pathogen
    // that spreads this fast via airborne spores in dense canopy --
    // industry/extension guidance is universally "any visible sporulation
    // = treat/remove immediately," not "wait until N% of leaves show it."
    // An earlier pass here wrongly reused powdery mildew's 2% as a stand-in
    // before that research existed; removed. Falls back to the generic
    // 15% default for now, which is ALSO not really right for an
    // any-detection pathogen -- the real fix is a dedicated "alert on any
    // positive detection" path in threshold-engine.ts rather than
    // expressing this as a percentage at all. Flagged as a follow-up, not
    // solved by picking a different number here.
  },
  {
    id: "path_rootrot", commonName: "Root rot complex (Pythium / Fusarium)", latin: "Pythium spp. / Fusarium spp.", kind: "pathogen",
    preventive: ["Root-zone O2 + temp control (<22C res)", "Clean water (UV/filtration)", "Preventive ag_trichoderma / Bacillus inoculant", "Sanitation of media/tools/reservoirs"],
    primaryBiocontrol: ["ag_trichoderma"],
    biopesticideRotation: ["pr_bacillus_sub", "pr_h2o2"],
    cultural: ["Isolate/cull collapsed plants", "Sanitize reservoir + lines", "Correct overwatering/low O2"],
    chemicalLastResort: [],
    followUp: { recheckDays: 5, releaseIntervalDays: 14, escalateIfNoDeclineDays: 14 },
    cautions: ["Fungus gnats spread it -- control them too", "H2O2 harms beneficial microbes -- reinoculate after"],
  },
  {
    id: "path_hlvd", commonName: "Hop latent viroid (HLVd)", latin: "HLVd", kind: "pathogen",
    preventive: ["PCR test mother stock routinely", "Tissue-culture clean stock", "Sanitize cutting tools between plants (bleach/Virkon)", "Dedicated tools per zone"],
    primaryBiocontrol: [],
    biopesticideRotation: [],
    cultural: ["Rogue + destroy infected plants", "Sterilize tools/surfaces", "Replace mothers from clean TC stock", "Trace + isolate source"],
    chemicalLastResort: [],
    followUp: null, // no treatment program -- monitor + sanitation only, see TREATMENTS.md
    cautions: ["NO chemical/biological cure -- management is testing + sanitation + clean stock only", "Mechanically transmitted via tools/handling"],
  },
];

export function findPestProgram(pestSpecies: string): PestProgram | null {
  const q = pestSpecies.trim().toLowerCase();
  return PESTS.find((p) => p.commonName.toLowerCase() === q || p.latin.toLowerCase() === q) ?? null;
}
export function findAgent(id: string): Agent | undefined {
  return AGENTS.find((a) => a.id === id);
}
export function findProduct(id: string): Product | undefined {
  return PRODUCTS.find((p) => p.id === id);
}
