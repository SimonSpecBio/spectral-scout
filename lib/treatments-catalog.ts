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

// Per-state legality (pest-research handoff, 2026-08-21, catalog-expansion.ts):
// "legal" only when confirmed on that state's official cannabis-pesticide
// list; "not_confirmed" when the product simply isn't listed anywhere yet
// found (not the same as banned); "unclear" when sources conflict or hedge
// ("likely legal, not directly confirmed"); "not_legal" reserved for a
// confirmed ban (no NEW_PRODUCTS entry uses it yet, but myclobutanil below
// is exactly this case, which is why it's hard-excluded rather than ever
// entered here as "not_legal").
export type LegalityStatus = "legal" | "not_legal" | "unclear" | "not_confirmed";

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
  // Per-state cannabis legality (CO/CA/OR only -- the three states with
  // captured research so far). Absent entirely on the original 12 products,
  // which predate this field and have no sourced per-state research; do not
  // backfill those with a guess. lib/legality.ts's isLegalInState() is the
  // single place that should read this.
  cannabisLegalStatus?: Record<"CO" | "CA" | "OR", { status: LegalityStatus; note?: string }>;
  // Links a named-brand SKU to the generic active-ingredient Product id it
  // supplements (e.g. Serenade -> pr_bacillus_sub), so inventory/recs can
  // recognize both without duplicating the underlying chemistry entry.
  brandOf?: string;
}

// MYCLOBUTANIL HARD-BLOCK (pest-research handoff, 2026-08-21): never add
// myclobutanil (Eagle 20EW / Systhane) to PRODUCTS. It forms hydrogen
// cyanide gas when combusted/vaped and is explicitly banned in every
// cannabis-legal state -- not "restricted," banned outright. It is the
// active ingredient most associated with real cannabis pesticide-residue
// recalls. If a generic powdery-mildew fungicide from a non-cannabis-
// specific source is ever proposed for this catalog, check it isn't this
// one before adding it.

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
  { id: "ag_lacewing", name: "Chrysoperla carnea", role: "generalist predator (larvae)", targets: ["pest_aphid", "pest_mealybug", "pest_whitefly", "pest_caterpillar"], typicalRate: "5-10 larvae /m2 hotspot", reintroDays: 10, notes: "Voracious generalist; good clean-up on hotspots. Also eats moth eggs/small caterpillars (Koppert)." },
  { id: "ag_encarsia", name: "Encarsia formosa", role: "parasitoid wasp", targets: ["pest_whitefly"], typicalRate: "cards 1-3 /m2 weekly", reintroDays: 7, notes: "Best on greenhouse whitefly (Trialeurodes); warm + good light." },
  { id: "ag_eretmocerus", name: "Eretmocerus eremicus", role: "parasitoid wasp", targets: ["pest_whitefly"], typicalRate: "cards 1-3 /m2 weekly", reintroDays: 7, notes: "Better on Bemisia and at higher temps; often mixed with Encarsia." },
  { id: "ag_delphastus", name: "Delphastus catalinae", role: "predatory beetle", targets: ["pest_whitefly"], typicalRate: "0.25-1 /m2 on hotspots", reintroDays: 14, notes: "Curative on heavy whitefly; eats eggs." },
  { id: "ag_stratiolaelaps", name: "Stratiolaelaps scimitus", role: "soil predatory mite", targets: ["pest_fungusgnat", "pest_thrips", "pest_rootaphid"], typicalRate: "125-250 /m2 media surface", reintroDays: 28, notes: "Eats fungus gnat larvae + thrips pupae in soil. Some root aphid suppression too (Koppert/Arbico)." },
  { id: "ag_steinernema", name: "Steinernema feltiae", role: "entomopathogenic nematode", targets: ["pest_fungusgnat", "pest_thrips"], typicalRate: "0.5M /m2 drench", reintroDays: 7, notes: "Media drench; keep media moist; reapply." },
  { id: "ag_dalotia", name: "Dalotia (Atheta) coriaria", role: "rove beetle", targets: ["pest_fungusgnat", "pest_thrips"], typicalRate: "establish colony on media", reintroDays: 28, notes: "Soil-dwelling generalist; good with Stratiolaelaps." },
  { id: "ag_cryptolaemus", name: "Cryptolaemus montrouzieri", role: "mealybug destroyer beetle", targets: ["pest_mealybug"], typicalRate: "1-5 /m2 on hotspots", reintroDays: 21, notes: "Curative on mealybug colonies; warm-loving." },
  { id: "ag_trichoderma", name: "Trichoderma harzianum/atroviride", role: "antagonistic fungus (root)", targets: ["path_rootrot"], typicalRate: "media inoculant per label", reintroDays: 30, notes: "Preventive root colonizer vs Pythium/Fusarium." },
  { id: "ag_clonostachys", name: "Clonostachys rosea", role: "antagonistic fungus (foliar/wound)", targets: ["path_botrytis"], typicalRate: "foliar per label", reintroDays: 14, notes: "Preventive vs Botrytis on senescing tissue/wounds." },

  // Added from the pest-research handoff (2026-08-21, catalog-expansion.ts)
  // to give the two new zero-coverage programs below (caterpillars, root
  // aphids) a real primaryBiocontrol option. Sourced from supplier technical
  // sheets (Koppert/Certis) -- see catalog-expansion.ts's header comment.
  { id: "ag_hb_nematode", name: "Heterorhabditis bacteriophora", role: "entomopathogenic nematode (root-zone)", targets: ["pest_rootaphid"], typicalRate: "250,000-500,000/m2 soil drench (light-moderate); 1x 50M pack per 30-50gal water per 1,000 sq ft for root aphid specifically", reintroDays: 21, notes: "Direct soil drench, not foliar -- infects root aphids in the root zone where H. bacteriophora actively hunts (unlike S. feltiae, which is more surface/shallow-dwelling). Keep media moist 3-4wk after application. Water temp <=25C, soil temp 19-33C optimal. Source: Koppert/Natural Enemies Larvanem root-aphid guide." },
  { id: "ag_metarhizium", name: "Metarhizium anisopliae / M. brunneum", role: "entomopathogenic fungus (soil + foliar)", targets: ["pest_rootaphid", "pest_fungusgnat", "pest_thrips"], typicalRate: "indoor/greenhouse 4-16oz/50gal water soil drench; repeat every 5-10 days", reintroDays: 7, notes: "Alternative to Beauveria/Isaria for root-zone pests specifically -- Met52/Lalguard-brand products are the commercial source. Does not harm most beneficials. Sensitive to UV/heat -- soil drench use avoids that exposure. Source: Cornell IPM Metarhizium fact sheet." },
  { id: "ag_steinernema_carp", name: "Steinernema carpocapsae", role: "entomopathogenic nematode (foliar + soil)", targets: ["pest_caterpillar", "pest_fungusgnat"], typicalRate: "soil 250,000-500,000/m2; foliar 1-3M/liter to runoff", reintroDays: 10, notes: "The one beneficial-nematode species with real documented efficacy against caterpillars (cutworms and other Lepidoptera larvae), distinct from S. feltiae (fungus-gnat/thrips-focused). UV/desiccation sensitive -- apply evening/early morning only. Source: Koppert Capsanem." },
];

export const PRODUCTS: Product[] = [
  { id: "pr_insecticidal_soap", name: "Insecticidal soap (K-salts of fatty acids)", class: "soap", type: "biopesticide-minrisk", targets: ["pest_tssm", "pest_aphid", "pest_whitefly", "pest_mealybug", "pest_thrips"], reiHours: 0, phiDays: 0, cautions: "Contact only; coverage critical; can burn tender growth; incompatible with releasing beneficials same day." },
  { id: "pr_hort_oil", name: "Horticultural / neem oil", class: "oil", type: "biopesticide-minrisk", targets: ["pest_tssm", "pest_broadmite", "pest_whitefly", "pest_aphid", "path_pm"], reiHours: 4, phiDays: 0, cautions: "Do NOT combine or overlap with sulfur (~2wk). Avoid in heat/high light. Not in late flower (residue)." },
  { id: "pr_sulfur", name: "Sulfur (wettable / vaporizer burner)", class: "mineral", type: "biopesticide-minrisk", targets: ["path_pm", "pest_broadmite", "pest_tssm"], reiHours: 24, phiDays: 0, cautions: "NEVER with oils (2wk gap). Not in mid-late flower (taste/residue). Ventilate; respirator for burners. Phytotoxic in heat." },
  { id: "pr_kbicarb", name: "Potassium bicarbonate", class: "bicarbonate", type: "biopesticide-minrisk", targets: ["path_pm"], reiHours: 4, phiDays: 0, cautions: "Contact/curative-eradicant on PM; rotate to avoid residue; test small area." },
  { id: "pr_bacillus_sub", name: "Bacillus subtilis / amyloliquefaciens", class: "microbial-fungicide", type: "biopesticide", targets: ["path_pm", "path_botrytis"], reiHours: 4, phiDays: 0, cautions: "Preventive/early; needs good coverage and repeat." },
  { id: "pr_bti", name: "Bacillus thuringiensis israelensis (Bti)", class: "microbial-insecticide", type: "biopesticide", targets: ["pest_fungusgnat"], reiHours: 4, phiDays: 0, cautions: "Larval drench; reapply; pair with dry-back + nematodes." },
  { id: "pr_beauveria", name: "Beauveria bassiana", class: "entomopathogenic-fungus", type: "biopesticide", targets: ["pest_whitefly", "pest_thrips", "pest_aphid", "pest_tssm", "pest_mealybug"], reiHours: 4, phiDays: 0, cautions: "Needs humidity to infect; can harm some beneficials -- separate applications." },
  { id: "pr_isaria", name: "Cordyceps (Isaria) fumosorosea", class: "entomopathogenic-fungus", type: "biopesticide", targets: ["pest_whitefly", "pest_thrips", "pest_broadmite", "pest_rootaphid"], reiHours: 4, phiDays: 0, cautions: "As Beauveria; humidity-dependent. Also labeled for root aphids incl. rice root aphid on cannabis (Certis PFR-97 label / CSU Extension)." },
  { id: "pr_spinosad", name: "Spinosad", class: "spinosyn", type: "biopesticide-derived", targets: ["pest_thrips"], reiHours: 4, phiDays: 3, cautions: "Rotate/limited uses (resistance). Toxic to bees + some beneficials when wet. Check cannabis legality." },
  { id: "pr_abamectin", name: "Abamectin", class: "avermectin", type: "chemical", targets: ["pest_tssm", "pest_broadmite", "pest_thrips"], reiHours: 12, phiDays: 7, cautions: "RESTRICTED / often PROHIBITED on cannabis. Translaminar miticide. Resistance mgmt. Verify legality + label.", restricted: true },
  { id: "pr_flonicamid", name: "Flonicamid", class: "feeding-blocker", type: "chemical", targets: ["pest_aphid", "pest_whitefly"], reiHours: 12, phiDays: 7, cautions: "RESTRICTED on cannabis in many markets. Verify legality + label.", restricted: true },
  { id: "pr_h2o2", name: "Hydrogen peroxide / root-zone oxygenation", class: "oxidizer/cultural", type: "cultural", targets: ["path_rootrot"], reiHours: 0, phiDays: 0, cautions: "Root-zone sanitation in hydro; can harm beneficial microbes -- reinoculate." },

  // Added from the pest-research handoff (2026-08-21, catalog-expansion.ts).
  // Sourced from EPA product labels / state cannabis-pesticide lists (CO
  // CDA, CA CDPR, OR ODA) -- see that file's header for full citations.
  // Only pr_dipel/pr_xentari/pr_met52 are wired into a pest program's
  // rotation below (the two real zero-coverage gaps this pass targeted);
  // the rest fill out the catalog/inventory for named-brand recognition and
  // are deliberately not inserted into existing programs' rotation order --
  // that's an editorial call on rotation sequencing the source research
  // didn't make, so it isn't invented here either.
  {
    id: "pr_grandevo", name: "Grandevo (Chromobacterium subtsugae)", class: "microbial", type: "biopesticide",
    targets: ["pest_broadmite", "pest_tssm", "pest_aphid", "pest_whitefly", "pest_thrips"], reiHours: 4, phiDays: 0,
    cautions: "One of the few biopesticides with explicit named cannabis-use approval in all three target states (CDPR approved it by name in July 2018). Good first-choice broad-mite option -- current catalog only has sulfur/oil/Isaria for broad mite.",
    cannabisLegalStatus: { CO: { status: "legal", note: "Confirmed on CDA list" }, CA: { status: "legal", note: "CDPR specifically approved (July 2018)" }, OR: { status: "legal", note: "Confirmed on Oregon ODA list" } },
  },
  {
    id: "pr_venerate", name: "Venerate (heat-killed Burkholderia spp.)", class: "biochemical/microbial-derived", type: "biopesticide",
    targets: ["pest_aphid", "pest_thrips", "pest_tssm", "pest_whitefly", "pest_mealybug"], reiHours: 4, phiDays: 0,
    cautions: "Broad-spectrum, legal in all three target states. Good rotation partner with Grandevo to avoid resistance.",
    cannabisLegalStatus: { CO: { status: "legal", note: "Confirmed on CDA list" }, CA: { status: "legal", note: "Approved by early 2019" }, OR: { status: "legal", note: "Confirmed on Oregon ODA list" } },
  },
  {
    id: "pr_pyganic", name: "PyGanic Crop Protection EC 1.4 II (Pyrethrins 1.4%)", class: "botanical", type: "biopesticide",
    targets: ["pest_aphid", "pest_thrips", "pest_whitefly", "pest_tssm", "pest_fungusgnat"], reiHours: 12, phiDays: 0,
    cautions: "REI is 12h, not the 4h typical of most biopesticides here -- do not assume 4h when scheduling re-entry. CA legality not confirmed against CDPR's list; use CO/OR only until CA is verified.",
    cannabisLegalStatus: { CO: { status: "legal", note: "Confirmed on CDA list" }, CA: { status: "unclear", note: "Not confirmed against CDPR's list" }, OR: { status: "legal", note: "Confirmed on Oregon ODA list" } },
  },
  {
    id: "pr_azaguard", name: "AzaGuard / Molt-X (Azadirachtin 3%)", class: "biochemical (botanical IGR)", type: "biopesticide",
    targets: ["pest_aphid", "pest_whitefly", "pest_thrips", "pest_fungusgnat", "pest_mealybug"], reiHours: 4, phiDays: 0,
    cautions: "IGR (growth regulator) mode of action -- slower acting than a contact product, best used preventively or on early-instar populations, not as a knockdown for a severe active infestation.",
    cannabisLegalStatus: { CO: { status: "legal", note: "Confirmed on CDA list" }, CA: { status: "unclear", note: "Likely legal (azadirachtin tolerance-exempt); not directly confirmed against CDPR list" }, OR: { status: "legal", note: "Confirmed on Oregon ODA list" } },
  },
  {
    id: "pr_neemix", name: "Neemix 4.5 (Azadirachtin 4.5%)", class: "biochemical (botanical IGR)", type: "biopesticide",
    targets: ["pest_aphid", "pest_whitefly", "pest_thrips", "pest_fungusgnat"], reiHours: 4, phiDays: 0,
    cautions: "Not found on Oregon's official list despite AzaGuard/Molt-X (same active ingredient, different registrant) being OR-legal -- legality is registration-specific, not just active-ingredient-specific. Do not treat as interchangeable with AzaGuard for OR compliance purposes.",
    cannabisLegalStatus: { CO: { status: "legal", note: "Confirmed on CDA list" }, CA: { status: "unclear", note: "Likely legal but verify current status" }, OR: { status: "not_confirmed", note: "Not found on Oregon ODA list -- use AzaGuard/Molt-X instead for OR" } },
  },
  {
    id: "pr_regalia", name: "Regalia CG (Reynoutria sachalinensis extract 5%)", class: "biochemical (plant extract)", type: "biopesticide",
    targets: ["path_pm", "path_botrytis"], reiHours: 4, phiDays: 0,
    cautions: "Explicit named cannabis-use approval in all three states (same as Grandevo). Induces the plant's own systemic defense response rather than killing the pathogen directly -- best as a preventive/early-stage rotation partner, not a curative eradicant like potassium bicarbonate.",
    cannabisLegalStatus: { CO: { status: "legal", note: "Confirmed on CDA list" }, CA: { status: "legal", note: "CDPR specifically approved (July 2018)" }, OR: { status: "legal", note: "Confirmed on Oregon ODA list" } },
  },
  {
    id: "pr_serenade", name: "Serenade ASO (Bacillus subtilis strain QST 713)", class: "microbial fungicide", type: "biopesticide",
    targets: ["path_pm", "path_botrytis"], reiHours: 4, phiDays: 0,
    cautions: "Named brand of the same active ingredient already generically listed as pr_bacillus_sub -- add this SKU so growers can match what's on their actual product label/invoice.",
    brandOf: "pr_bacillus_sub",
    cannabisLegalStatus: { CO: { status: "legal", note: "'Serenade Garden' confirmed on CDA list" }, CA: { status: "unclear", note: "Likely legal (tolerance-exempt strain); not directly confirmed against CDPR list" }, OR: { status: "legal", note: "Confirmed on Oregon ODA list" } },
  },
  {
    id: "pr_doublenickel", name: "Double Nickel 55 / LC (Bacillus amyloliquefaciens strain D747)", class: "microbial fungicide/bactericide", type: "biopesticide",
    targets: ["path_pm", "path_botrytis", "path_rootrot"], reiHours: 4, phiDays: 0,
    cautions: "Broader label than Serenade -- also suppresses Fusarium/bacterial disease, useful as a rotation option for root-rot-adjacent prevention as well as foliar PM/Botrytis.",
    cannabisLegalStatus: { CO: { status: "legal", note: "Confirmed on CDA list" }, CA: { status: "unclear", note: "Likely legal (tolerance-exempt strain); not directly confirmed against CDPR list" }, OR: { status: "legal", note: "Confirmed on Oregon ODA list" } },
  },
  {
    id: "pr_mpede", name: "M-Pede (Potassium salts of fatty acids 49%)", class: "soap", type: "biopesticide-minrisk",
    targets: ["pest_aphid", "pest_whitefly", "pest_tssm", "path_pm"], reiHours: 12, phiDays: 0,
    cautions: "Named brand of the same chemistry already generically listed as pr_insecticidal_soap -- REI is 12h on this specific label (longer than the generic soap entry's 0h), so use THIS entry's REI when the product on hand is specifically M-Pede.",
    brandOf: "pr_insecticidal_soap",
    cannabisLegalStatus: { CO: { status: "legal", note: "Confirmed on CDA list" }, CA: { status: "unclear", note: "0-day PHI, soap actives generally tolerance-exempt; not directly confirmed" }, OR: { status: "legal", note: "Confirmed on Oregon ODA list" } },
  },
  {
    id: "pr_rootshield", name: "RootShield WP (Trichoderma harzianum strain T-22)", class: "microbial fungicide", type: "biopesticide",
    targets: ["path_rootrot"], reiHours: 4, phiDays: 0,
    cautions: "Named brand of the same species already generically listed as agent ag_trichoderma -- this is the product/drench form vs. the living-organism release. Not found on Oregon's list under this brand name -- verify before OR use even though the active organism itself is common.",
    brandOf: "ag_trichoderma",
    cannabisLegalStatus: { CO: { status: "not_confirmed", note: "Verify" }, CA: { status: "unclear", note: "Likely legal (T. harzianum tolerance-exempt); not directly confirmed against CDPR list" }, OR: { status: "not_confirmed", note: "Not found on Oregon ODA list -- verify" } },
  },
  {
    id: "pr_actinovate", name: "Actinovate AG (Streptomyces lydicus strain WYEC 108)", class: "microbial fungicide", type: "biopesticide",
    targets: ["path_rootrot", "path_pm"], reiHours: 1, phiDays: 0,
    cautions: "Genuinely unresolved legality -- widely used in cannabis root-disease management on the ground, but not confirmed on any of CO/CA/OR's official cannabis-pesticide lists under this name. Flag to the grower as 'verify with your state before use' rather than presenting as cleared.",
    cannabisLegalStatus: { CO: { status: "not_confirmed", note: "Verify" }, CA: { status: "unclear", note: "Not found on OR/CO lists under this exact name" }, OR: { status: "not_confirmed", note: "Not found on Oregon ODA list" } },
  },
  {
    id: "pr_dipel", name: "Dipel DF (Bacillus thuringiensis subsp. kurstaki 54%)", class: "microbial insecticide", type: "biopesticide",
    targets: ["pest_caterpillar"], reiHours: 4, phiDays: 0,
    cautions: "Standard-of-care caterpillar (budworm/looper/armyworm) control with zero prior catalog coverage for this pest. Colorado restricts to hemp-in-greenhouse-settings per CDA guidance -- verify current CO guidance before outdoor cannabis use.",
    cannabisLegalStatus: { CO: { status: "legal", note: "Restricted -- hemp only, greenhouse settings per CDA guidance" }, CA: { status: "unclear", note: "Likely legal (Bt kurstaki tolerance-exempt); not directly confirmed against CDPR list" }, OR: { status: "legal", note: "Confirmed on Oregon ODA list" } },
  },
  {
    id: "pr_xentari", name: "Xentari (Bacillus thuringiensis subsp. aizawai)", class: "microbial insecticide", type: "biopesticide",
    targets: ["pest_caterpillar"], reiHours: 4, phiDays: 0,
    cautions: "Rotation partner for Dipel -- effective against some Bt-kurstaki-resistant Lepidoptera, so alternating the two slows resistance development. CO legality not separately confirmed (only found under the kurstaki category) -- verify before CO use.",
    cannabisLegalStatus: { CO: { status: "not_confirmed", note: "Only found under the kurstaki category -- verify" }, CA: { status: "unclear", note: "Likely legal (Bt tolerance-exempt); not directly confirmed against CDPR list" }, OR: { status: "legal", note: "Confirmed on Oregon ODA list" } },
  },
  {
    id: "pr_met52", name: "Met52 EC (Metarhizium anisopliae strain F52 11%)", class: "entomopathogenic fungus", type: "biopesticide",
    targets: ["pest_rootaphid", "pest_fungusgnat"], reiHours: 4, phiDays: 0,
    cautions: "Do NOT treat as interchangeable with 'Lalguard M52 OD' for legality purposes -- that is a different registrant/strain (M. brunneum) that IS on the Oregon list, while Met52 EC itself was not found there. Confirm the exact brand on the product label before relying on this entry's legality column.",
    cannabisLegalStatus: { CO: { status: "not_confirmed", note: "Verify" }, CA: { status: "unclear", note: "Not found on OR/CO lists; do not assume equivalence to Lalguard M52 OD" }, OR: { status: "not_confirmed", note: "Not found under Met52 brand specifically" } },
  },
];

export const PESTS: PestProgram[] = [
  {
    id: "pest_tssm", commonName: "Two-spotted spider mite", latin: "Tetranychus urticae", kind: "pest",
    preventive: ["Scout undersides weekly (hand lens)", "Keep humidity up / avoid hot-dry stress", "Release Neoseiulus californicus or Amblyseius andersoni preventively"],
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
    preventive: ["Inspect new growth (30-60x scope)", "Quarantine incoming clones", "Preventive Amblyseius swirskii / Amblyseius andersoni"],
    primaryBiocontrol: ["ag_swirskii", "ag_cucumeris"],
    biopesticideRotation: ["pr_sulfur", "pr_hort_oil", "pr_isaria"],
    cultural: ["Cull severely distorted tips", "Isolate infested plants"],
    chemicalLastResort: ["pr_abamectin"],
    followUp: { recheckDays: 4, releaseIntervalDays: 7, escalateIfNoDeclineDays: 10 },
    cautions: ["Do not overlap sulfur and oils", "Symptoms lag population -- treat early and aggressively"],
  },
  {
    id: "pest_thrips", commonName: "Western flower thrips", latin: "Frankliniella occidentalis", kind: "pest",
    preventive: ["Blue sticky cards for monitoring", "Preventive Neoseiulus cucumeris / Amblyseius swirskii sachets", "Steinernema feltiae or Stratiolaelaps scimitus for soil pupae"],
    primaryBiocontrol: ["ag_swirskii", "ag_orius", "ag_cucumeris"],
    biopesticideRotation: ["pr_beauveria", "pr_spinosad", "pr_insecticidal_soap"],
    cultural: ["Mass-trap with blue cards", "Remove weeds/flowering hosts"],
    chemicalLastResort: ["pr_abamectin", "pr_spinosad"],
    followUp: { recheckDays: 5, releaseIntervalDays: 7, escalateIfNoDeclineDays: 14 },
    cautions: ["Vectors viruses", "Spinosad: rotate, limited uses, harms beneficials when wet"],
  },
  {
    id: "pest_aphid", commonName: "Aphids (green peach / cannabis aphid)", latin: "Myzus persicae / Phorodon cannabis", kind: "pest",
    preventive: ["Yellow cards", "Banker plants for Aphidius colemani", "Scout growing tips + undersides"],
    primaryBiocontrol: ["ag_aphidius_col", "ag_aphidoletes", "ag_lacewing"],
    biopesticideRotation: ["pr_insecticidal_soap", "pr_hort_oil", "pr_beauveria"],
    cultural: ["Squash/prune hotspot colonies", "Remove alate sources"],
    chemicalLastResort: ["pr_flonicamid"],
    followUp: { recheckDays: 4, releaseIntervalDays: 7, escalateIfNoDeclineDays: 12 },
    cautions: ["Cannabis aphid can be cryptic on stems", "Preserve mummies (parasitized aphids) -- don't spray over them"],
  },
  {
    id: "pest_whitefly", commonName: "Whitefly", latin: "Trialeurodes vaporariorum / Bemisia tabaci", kind: "pest",
    preventive: ["Yellow cards", "Preventive Encarsia formosa / Amblyseius swirskii", "Screen intakes; inspect clones"],
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
    preventive: ["Yellow cards at media level", "Avoid overwatering / allow dry-back", "Preventive Stratiolaelaps scimitus + Steinernema feltiae"],
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
    preventive: ["Airflow + VPD/humidity control", "Resistant genetics", "Preventive Bacillus subtilis / amyloliquefaciens or sulfur (veg only)"],
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
    preventive: ["RH <50% in flower + airflow", "Defoliate/open canopy", "Preventive Bacillus subtilis / amyloliquefaciens or Clonostachys rosea"],
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
    preventive: ["Root-zone O2 + temp control (<22C res)", "Clean water (UV/filtration)", "Preventive Trichoderma harzianum/atroviride / Bacillus inoculant", "Sanitation of media/tools/reservoirs"],
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

  // Added from the pest-research handoff (2026-08-21, catalog-expansion.ts)
  // -- these are the two real, zero-coverage gaps that pass found (no
  // program existed for either pest before this). No defaultDensityThreshold/
  // defaultOccupancyPctThreshold given, same as aphids/broad mite/thrips-on-
  // leaves/root rot above -- no defensible sourced number was found, so
  // both correctly fall back to threshold-engine.ts's generic defaults
  // rather than a fabricated one.
  {
    id: "pest_caterpillar",
    commonName: "Caterpillars / loopers (budworms, armyworms)",
    latin: "Spodoptera spp. / Trichoplusia ni / Helicoverpa spp.",
    kind: "pest",
    preventive: [
      "Scout for frass (droppings) and bud entry holes -- damage is often found before the caterpillar itself is seen",
      "Pheromone traps for early adult-moth detection where available",
    ],
    primaryBiocontrol: ["ag_lacewing", "ag_steinernema_carp"],
    biopesticideRotation: ["pr_dipel", "pr_xentari", "pr_spinosad"],
    cultural: ["Hand-pick/remove visibly infested buds", "Reduce canopy density to expose larvae to predators/scouting"],
    chemicalLastResort: [],
    followUp: { recheckDays: 5, releaseIntervalDays: 7, escalateIfNoDeclineDays: 14 },
    cautions: [
      "Bud-feeding caterpillars are a real cannabis-specific concern (yield + mold entry point via frass/damage) with no prior catalog coverage at all -- this is a genuinely new program, not a refinement of an existing one.",
      "No chemicalLastResort entry currently has confirmed cannabis legality for this pest -- Bt kurstaki/aizawai rotation is the realistic primary control, not a biopesticide-then-chemical-backup pattern like the other programs.",
      "Rotate Dipel/Xentari to manage resistance -- do not use the same Bt subspecies every application.",
    ],
  },
  {
    id: "pest_rootaphid",
    commonName: "Root aphids",
    latin: "Rhopalosiphum spp. / Pemphigus spp.",
    kind: "pest",
    preventive: [
      "Inspect root zone of any wilting/stunted plant that shows no foliar pest signs -- root aphids are easy to miss because damage presents as generic nutrient/water stress",
      "Quarantine incoming clones -- root aphids travel on plant material, not by flight, in early colonization",
    ],
    primaryBiocontrol: ["ag_hb_nematode", "ag_stratiolaelaps", "ag_metarhizium"],
    biopesticideRotation: ["pr_met52"],
    cultural: ["Isolate affected containers/rows to slow spread", "Sanitize tools between plants once confirmed"],
    chemicalLastResort: [],
    followUp: { recheckDays: 7, releaseIntervalDays: 14, escalateIfNoDeclineDays: 21 },
    cautions: [
      "Distinct pest from foliar aphids (pest_aphid) -- soil/root-zone dwelling, requires drench application and root-zone-active biocontrol, not the foliar Aphidius/Aphidoletes program.",
      "No prior catalog coverage at all for this pest despite it being a well-documented cannabis-specific issue (rice root aphid).",
      "Confirmed legality is thin across all three states for every option here -- present these as 'best available, verify current label/state list' rather than a fully cleared program.",
    ],
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

const LEGALITY_STATES = ["CO", "CA", "OR"] as const;
type LegalityState = (typeof LEGALITY_STATES)[number];

// Per-state cannabis legality gate (ticket 68). Returns null whenever no
// gate should apply -- the product carries no per-state research at all, or
// the org's state isn't one of the three researched so far -- so callers
// fall back to today's behavior (Product.restricted only) rather than
// guessing. Only a real "not_legal" entry should ever be used to hide an
// option outright; "unclear"/"not_confirmed" are surfaced as a caution, not
// a block, since they mean "not yet confirmed either way," not "banned."
export function legalityFor(product: Product, orgState: string | null): { status: LegalityStatus; note?: string } | null {
  if (!product.cannabisLegalStatus || !orgState) return null;
  if (!(LEGALITY_STATES as readonly string[]).includes(orgState)) return null;
  return product.cannabisLegalStatus[orgState as LegalityState];
}
