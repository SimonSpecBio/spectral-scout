// Preset catalog for "+ Add from catalog" (10_inventory.svg) -- transcribed
// from treatments.json's agents[]/products[] (TREATMENTS.md's real seed
// data), filtered to the three stock categories this app actually tracks
// (scout_inventory_category: beneficial/biopesticide/chemical). Physical/
// cultural tools (sticky cards, H2O2) and the automated LightWare device
// are left out -- they aren't consumable stock in the same sense.
//
// Deliberately NOT wired to an auto-recommendation engine ("Event ->
// suggested treatment program", ARCHITECTURE.md ยง6.1's TREATMENTS.md flow).
// That requires a real jurisdiction/crop approved-product-list gate first
// -- treatments.json's own disclaimer is explicit that several chemical
// entries here (abamectin, flonicamid) are restricted or outright
// prohibited on cannabis in many markets, and showing them as an
// algorithmic "recommendation" with no compliance gate is a real risk this
// pass isn't taking. This catalog is just a faster way to add a stock item
// with sane REI/PHI defaults already filled in -- nothing here is ever
// auto-suggested against an event.
export type InventoryCategory = "beneficial" | "biopesticide" | "chemical";

export interface CatalogEntry {
  category: InventoryCategory;
  name: string;
  unit: string;
  reiHours: number | null;
  phiDays: number | null;
  cautions: string | null;
  restricted?: boolean; // cannabis-restricted per treatments.json -- shown as an explicit warning, never hidden
}

export const INVENTORY_CATALOG: CatalogEntry[] = [
  // Beneficials
  { category: "beneficial", name: "Phytoseiulus persimilis", unit: "units", reiHours: null, phiDays: null, cautions: "Best on active TSSM colonies; needs prey + humidity >60%." },
  { category: "beneficial", name: "Neoseiulus californicus", unit: "units", reiHours: null, phiDays: null, cautions: "More persistent at low prey/low humidity than persimilis." },
  { category: "beneficial", name: "Amblyseius swirskii", unit: "units", reiHours: null, phiDays: null, cautions: "Warm-climate (>20C). Sachets give slow release over weeks." },
  { category: "beneficial", name: "Neoseiulus cucumeris", unit: "units", reiHours: null, phiDays: null, cautions: "Targets thrips larvae; slower/cooler tolerant than swirskii." },
  { category: "beneficial", name: "Amblyseius andersoni", unit: "units", reiHours: null, phiDays: null, cautions: "Broad temperature tolerance; good early/preventive." },
  { category: "beneficial", name: "Orius insidiosus", unit: "units", reiHours: null, phiDays: null, cautions: "Eats thrips adults+larvae; needs pollen/prey; short daylength can diapause." },
  { category: "beneficial", name: "Feltiella acarisuga", unit: "units", reiHours: null, phiDays: null, cautions: "Finds hotspots well; humidity-dependent." },
  { category: "beneficial", name: "Aphidius colemani", unit: "units", reiHours: null, phiDays: null, cautions: "For small aphids (green peach). A. ervi for larger aphids." },
  { category: "beneficial", name: "Aphidoletes aphidimyza", unit: "units", reiHours: null, phiDays: null, cautions: "Larvae eat aphids; adults need dark/humidity; can diapause short days." },
  { category: "beneficial", name: "Chrysoperla carnea", unit: "units", reiHours: null, phiDays: null, cautions: "Voracious generalist; good clean-up on hotspots." },
  { category: "beneficial", name: "Encarsia formosa", unit: "units", reiHours: null, phiDays: null, cautions: "Best on greenhouse whitefly (Trialeurodes); warm + good light." },
  { category: "beneficial", name: "Eretmocerus eremicus", unit: "units", reiHours: null, phiDays: null, cautions: "Better on Bemisia and at higher temps; often mixed with Encarsia." },
  { category: "beneficial", name: "Delphastus catalinae", unit: "units", reiHours: null, phiDays: null, cautions: "Curative on heavy whitefly; eats eggs." },
  { category: "beneficial", name: "Stratiolaelaps scimitus", unit: "units", reiHours: null, phiDays: null, cautions: "Eats fungus gnat larvae + thrips pupae in soil." },
  { category: "beneficial", name: "Steinernema feltiae", unit: "units", reiHours: null, phiDays: null, cautions: "Media drench; keep media moist; reapply." },
  { category: "beneficial", name: "Dalotia (Atheta) coriaria", unit: "units", reiHours: null, phiDays: null, cautions: "Soil-dwelling generalist; good with Stratiolaelaps." },
  { category: "beneficial", name: "Cryptolaemus montrouzieri", unit: "units", reiHours: null, phiDays: null, cautions: "Curative on mealybug colonies; warm-loving." },
  { category: "beneficial", name: "Trichoderma harzianum/atroviride", unit: "units", reiHours: null, phiDays: null, cautions: "Preventive root colonizer vs Pythium/Fusarium." },
  { category: "beneficial", name: "Clonostachys rosea", unit: "units", reiHours: null, phiDays: null, cautions: "Preventive vs Botrytis on senescing tissue/wounds." },

  // Biopesticides (minimum-risk, microbial, and derived)
  { category: "biopesticide", name: "Insecticidal soap (K-salts of fatty acids)", unit: "L", reiHours: 0, phiDays: 0, cautions: "Contact only; coverage critical; can burn tender growth; incompatible with releasing beneficials same day." },
  { category: "biopesticide", name: "Horticultural / neem oil", unit: "L", reiHours: 4, phiDays: 0, cautions: "Do NOT combine or overlap with sulfur (~2wk). Avoid in heat/high light. Not in late flower (residue)." },
  { category: "biopesticide", name: "Sulfur (wettable / vaporizer burner)", unit: "L", reiHours: 24, phiDays: 0, cautions: "NEVER with oils (2wk gap). Not in mid-late flower (taste/residue). Ventilate; respirator for burners." },
  { category: "biopesticide", name: "Potassium bicarbonate", unit: "L", reiHours: 4, phiDays: 0, cautions: "Contact/curative-eradicant on PM; rotate to avoid residue; test small area." },
  { category: "biopesticide", name: "Bacillus subtilis / amyloliquefaciens", unit: "L", reiHours: 4, phiDays: 0, cautions: "Preventive/early; needs good coverage and repeat." },
  { category: "biopesticide", name: "Bacillus thuringiensis israelensis (Bti)", unit: "L", reiHours: 4, phiDays: 0, cautions: "Larval drench; reapply; pair with dry-back + nematodes." },
  { category: "biopesticide", name: "Beauveria bassiana", unit: "L", reiHours: 4, phiDays: 0, cautions: "Needs humidity to infect; can harm some beneficials -- separate applications." },
  { category: "biopesticide", name: "Cordyceps (Isaria) fumosorosea", unit: "L", reiHours: 4, phiDays: 0, cautions: "As Beauveria; humidity-dependent." },
  { category: "biopesticide", name: "Spinosad", unit: "L", reiHours: 4, phiDays: 3, cautions: "Rotate/limited uses (resistance). Toxic to bees + some beneficials when wet. Check cannabis legality." },

  // Chemical last-resort -- restricted flag surfaced explicitly, never hidden
  { category: "chemical", name: "Abamectin", unit: "L", reiHours: 12, phiDays: 7, cautions: "RESTRICTED / often PROHIBITED on cannabis. Translaminar miticide. Resistance mgmt. Verify legality + label.", restricted: true },
  { category: "chemical", name: "Flonicamid", unit: "L", reiHours: 12, phiDays: 7, cautions: "RESTRICTED on cannabis in many markets. Verify legality + label.", restricted: true },
];
