// Data + resolver for the home-grower "Should I worry?" pre-ID severity
// triage popup. Source: Airtable base 06 // RESEARCH, tables "Scout //
// Symptom Tree -- Catalog IDs" (13 rows) and "-- Decision Rules" (16 rows),
// compiled 2026-09-03, validated by Simon 2026-09-04 with two changes:
// (1) the powdery-mildew "wipes off with a finger" test is dropped --
// no source confirms that specific behavior, only that PM is a surface
// growth; (2) every "ask a person" fallback is replaced with
// species_picker (a real app capability) since the app has no
// expert-referral feature to route to.
//
// This is a v1 encoding, not a literal transcription: the Decision Rules
// table's answer-combination text references a few observable signs
// (e.g. "cottony wax clusters", "pear-shaped insects", "winged aphids on
// leaf hairs") that the readable question-bank doc summarizes loosely --
// those became their own Q3 chips here so the tree can actually
// discriminate aphid vs. mealybug vs. whitefly, matching the Decision
// Rules table (the authoritative source per the doc's own note) rather
// than the doc's abbreviated chip list.
//
// path_hlvd is never a candidate anywhere below, by design -- visual
// recognition is "unreliable" per Oregon State Extension and infection is
// frequently asymptomatic. It only ever surfaces as a standing caveat
// (showHlvdCaveat) recommending a lab/PCR test.

export type WhereOption = "leaf" | "new_growth" | "bud_flower" | "stem" | "roots" | "flying_near_soil";
export type CloseUpOption =
  | "webbing"
  | "powder"
  | "honeydew"
  | "stipple"
  | "curl"
  | "fuzzy_mold"
  | "frass"
  | "chewed"
  | "cottony"
  | "pear_shaped"
  | "winged_leaf_hair"
  | "dry_crispy"
  | "discoloration_only";
export type RootsOption = "unchecked" | "healthy" | "rotten";

export interface SymptomAnswers {
  where: WhereOption[];
  spreading: boolean | null;
  closeUp: CloseUpOption[];
  roots: RootsOption | null;
  fliesUp: boolean | null;
  decline: boolean | null;
}

export const EMPTY_ANSWERS: SymptomAnswers = {
  where: [],
  spreading: null,
  closeUp: [],
  roots: null,
  fliesUp: null,
  decline: null,
};

export const WHERE_OPTIONS: { value: WhereOption; label: string }[] = [
  { value: "leaf", label: "Leaf" },
  { value: "new_growth", label: "New growth" },
  { value: "bud_flower", label: "Bud or flower" },
  { value: "stem", label: "Stem" },
  { value: "roots", label: "Media / roots" },
  { value: "flying_near_soil", label: "Flying insects near the soil" },
];

export const CLOSE_UP_OPTIONS: { value: CloseUpOption; label: string }[] = [
  { value: "webbing", label: "Fine webbing" },
  { value: "powder", label: "White or gray powdery coating" },
  { value: "honeydew", label: "Sticky honeydew, ants, or sooty mold" },
  { value: "stipple", label: "Stipple or silver scarring" },
  { value: "curl", label: "Curling or thickened new growth" },
  { value: "fuzzy_mold", label: "Gray fuzzy mold or a brown mushy spot" },
  { value: "frass", label: "Frass, small holes, or tunneling" },
  { value: "chewed", label: "Chewed or skeletonized leaves, no holes/tunneling" },
  { value: "cottony", label: "Cottony, wax-covered insects, clustered and not moving" },
  { value: "pear_shaped", label: "Pear-shaped insects that don't fly away" },
  { value: "winged_leaf_hair", label: "Winged, aphid-like insects stuck to upper leaf hairs" },
  { value: "dry_crispy", label: "Dry, crispy browning, no fuzz, spread evenly" },
  { value: "discoloration_only", label: "None of these, just discoloration" },
];
export const CLOSE_UP_MAX = 3;

export function showCloseUpQuestion(where: WhereOption[]): boolean {
  return where.some((w) => w === "leaf" || w === "new_growth" || w === "bud_flower" || w === "stem");
}
export function showRootsQuestion(where: WhereOption[]): boolean {
  return where.includes("roots");
}
export function showFliesUpQuestion(where: WhereOption[], closeUp: CloseUpOption[]): boolean {
  return where.includes("flying_near_soil") || closeUp.includes("honeydew");
}

export interface SymptomResult {
  // Catalog ids, 0-2 entries -- see displayNameForPestSpecies for showing
  // these to a grower.
  candidates: string[];
  exclude: string[];
  confidence: "high" | "low" | null;
  showHlvdCaveat: boolean;
  // Short rationale shown alongside the result -- never a bare id with no
  // explanation, per the research's own "never a single guess" framing.
  note: string;
}

interface Rule {
  // Matches the Decision Rules Airtable row this encodes, for auditing.
  rowLabel: string;
  match: (a: SymptomAnswers) => boolean;
  candidates: string[];
  exclude?: string[];
  confidence: "high" | "low";
  note: string;
}

const has = (list: CloseUpOption[], v: CloseUpOption) => list.includes(v);
const whereHas = (list: WhereOption[], v: WhereOption) => list.includes(v);

// Evaluated in order -- first match wins. More specific combinations are
// listed before more generic ones (e.g. "honeydew + cottony" before plain
// "honeydew") so a specific insect description isn't shadowed by a vaguer
// rule earlier in the list.
const RULES: Rule[] = [
  {
    rowLabel: "Webbing + stipple, spreading to many plants",
    match: (a) =>
      (whereHas(a.where, "leaf") || whereHas(a.where, "new_growth")) &&
      a.spreading === true &&
      has(a.closeUp, "webbing") &&
      has(a.closeUp, "stipple"),
    candidates: ["pest_tssm", "pest_thrips"],
    exclude: ["path_pm"],
    confidence: "high",
    note: "Webbing is near-diagnostic for spider mites -- thrips don't web, but stippling alone overlaps both, so thrips stays listed as a secondary possibility.",
  },
  {
    rowLabel: "White or gray powdery coating",
    match: (a) => has(a.closeUp, "powder"),
    candidates: ["path_pm"],
    exclude: ["pest_tssm", "pest_broadmite"],
    confidence: "high",
    note: "A surface powdery coating (spores/mycelium sitting on top of the leaf) is the characteristic sign of powdery mildew.",
  },
  {
    rowLabel: "Curl of new growth, no webbing, mite not visible",
    match: (a) => whereHas(a.where, "new_growth") && has(a.closeUp, "curl") && !has(a.closeUp, "webbing"),
    candidates: ["pest_broadmite"],
    exclude: ["pest_tssm"],
    confidence: "low",
    note: "Broad mite is invisible without 20x magnification, so not seeing a mite doesn't rule it out. Growth-regulator/herbicide injury and boron/zinc/magnesium deficiency can look identical -- worth checking those too.",
  },
  {
    rowLabel: "Decline + winged aphids on upper leaf hairs",
    match: (a) => a.decline === true && has(a.closeUp, "winged_leaf_hair"),
    candidates: ["pest_rootaphid"],
    confidence: "high",
    note: "Winged aphid-like insects stuck to upper leaves (not on the roots) is how root aphid is actually first noticed.",
  },
  {
    rowLabel: "Honeydew + cottony wax clusters in axils/crown",
    match: (a) => has(a.closeUp, "honeydew") && has(a.closeUp, "cottony"),
    candidates: ["pest_mealybug"],
    exclude: ["pest_aphid", "pest_whitefly"],
    confidence: "high",
    note: "Cottony, wax-covered insects clustered in protected crevices (not spread across the leaf) is mealybug-specific.",
  },
  {
    rowLabel: "Honeydew + pear-shaped insects, don't fly",
    match: (a) => has(a.closeUp, "honeydew") && has(a.closeUp, "pear_shaped") && a.fliesUp !== true,
    candidates: ["pest_aphid"],
    exclude: ["pest_whitefly", "pest_mealybug"],
    confidence: "high",
    note: "Pear-shaped insects with cornicles that don't fly off when disturbed is aphid-specific.",
  },
  {
    rowLabel: "Honeydew + insects fly up in a cloud",
    match: (a) => has(a.closeUp, "honeydew") && a.fliesUp === true,
    candidates: ["pest_whitefly"],
    exclude: ["pest_aphid", "pest_mealybug"],
    confidence: "high",
    note: "Flying up in a cloud when the plant is disturbed is the differentiator that separates whitefly from aphid and mealybug.",
  },
  {
    rowLabel: "Honeydew only, no insect located",
    match: (a) => has(a.closeUp, "honeydew"),
    candidates: ["pest_aphid", "pest_whitefly"],
    confidence: "low",
    note: "Sooty mold grows on honeydew from aphids, whitefly, or mealybug interchangeably -- not diagnostic alone. Look closer at the insects themselves if you can.",
  },
  {
    rowLabel: "Frass/holes in buds + tunneling or visible caterpillar",
    match: (a) => whereHas(a.where, "bud_flower") && has(a.closeUp, "frass"),
    candidates: ["pest_caterpillar"],
    confidence: "high",
    note: "Frass plus tunneling into a bud is the diagnostic pairing for bud-feeding caterpillars. Species-level ID isn't resolvable from early instars or photos.",
  },
  {
    rowLabel: "Chewed/skeletonized leaves only, no bud damage",
    match: (a) => whereHas(a.where, "leaf") && has(a.closeUp, "chewed"),
    candidates: ["pest_caterpillar"],
    confidence: "low",
    note: "Matches foliage-feeding caterpillar damage, but diffuse leaf chewing alone has other causes too.",
  },
  {
    rowLabel: "Bud collapse + gray fuzzy mold inside",
    match: (a) => whereHas(a.where, "bud_flower") && has(a.closeUp, "fuzzy_mold"),
    candidates: ["path_botrytis"],
    exclude: ["path_pm", "pest_caterpillar"],
    confidence: "high",
    note: "A single bud collapsing internally with gray-brown fuzz is the diagnostic pairing for Botrytis -- distinct from powdery mildew's surface-only powder or caterpillar frass/tunneling.",
  },
  {
    rowLabel: "Dry crispy bud browning, no fuzz, uniform across canopy",
    match: (a) => whereHas(a.where, "bud_flower") && has(a.closeUp, "dry_crispy"),
    candidates: [],
    confidence: "low",
    note: "Dry, uniform browning with no fuzz reads more like heat or light stress than early Botrytis.",
  },
  {
    rowLabel: "Wilting, clean leaves, roots inspected and rotten",
    match: (a) => a.roots === "rotten",
    candidates: ["path_rootrot"],
    exclude: ["pest_fungusgnat", "pest_rootaphid"],
    confidence: "high",
    note: "Roots that are brown, black, or mushy on direct inspection confirms root rot over the fungus-gnat/root-aphid ambiguity below.",
  },
  {
    rowLabel: "Wilting, clean leaves, flying insects near soil, roots unchecked",
    match: (a) => (whereHas(a.where, "roots") || whereHas(a.where, "flying_near_soil")) && a.roots !== "healthy",
    candidates: ["pest_fungusgnat", "pest_rootaphid"],
    confidence: "low",
    note: "Both are root-zone pests that first present as wilting with otherwise clean foliage. Checking the roots directly is the next step to tell them apart.",
  },
  {
    rowLabel: "Stippling only, spreading, no webbing/specks/card catch",
    match: (a) => whereHas(a.where, "leaf") && a.spreading === true && has(a.closeUp, "stipple") && !has(a.closeUp, "webbing"),
    candidates: ["pest_tssm", "pest_thrips"],
    confidence: "low",
    note: "Stippling alone is shared by mites and thrips and isn't species-specific without webbing (mites) or fecal specks (thrips).",
  },
];

// Row 13, "general decline, no specific sign matches" -- the HLVd routing
// row. Never names path_hlvd as a candidate; only fires the caveat.
export function resolveSymptomTree(answers: SymptomAnswers): SymptomResult {
  for (const rule of RULES) {
    if (rule.match(answers)) {
      return {
        candidates: rule.candidates,
        exclude: rule.exclude ?? [],
        confidence: rule.confidence,
        // The decline gate is a standing caveat layered on top of whatever
        // else matched, not exclusive to the no-match case -- HLVd is
        // frequently asymptomatic, so general decline is worth flagging
        // even alongside a real candidate.
        showHlvdCaveat: answers.decline === true,
        note: rule.note,
      };
    }
  }
  return {
    candidates: [],
    exclude: [],
    confidence: null,
    showHlvdCaveat: answers.decline === true,
    note: "Nothing here points at a specific cause yet. Search the catalog yourself, or keep watching and check back if it changes.",
  };
}
