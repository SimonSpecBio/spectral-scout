import type { PestProgram } from "@/lib/treatments-catalog";

// The standing Spectral pesticidal light protocol -- encoded directly rather than treated
// as a swappable catalog product, since it isn't one: there's no "name" to
// look up, no REI/PHI to vary by product, no inventory item behind it.
// Always offered (never filtered by cannabis legality -- it's a light
// fixture, not a registered pesticide), unlike every other tier in
// RecommendationsPanel.
//
// Targeting and schedule are Simon's direct guidance (2026-08-21), not
// inferred or researched -- an earlier draft guessed at a "shade-seeking
// behavior" rationale sourced from an unconfirmed internal brief; that
// guess has been replaced with the real rule below.

export type SpectralApplicability = "insect" | "pathogen" | "not_indicated";

export interface SpectralLightProtocol {
  applicability: SpectralApplicability;
  summary: string;
  // Human-readable schedule description -- empty when not_indicated, since
  // there's nothing to schedule.
  schedule: string;
}

// Small soft-bodied insects the light is effective against. Excludes
// fungus gnats (larvae live in growing media -- light can't reach them
// there) and caterpillars/loopers (not small/soft-bodied -- tougher larval
// cuticle, a different control problem entirely) and root aphids
// (soil-zone, same physical-reach problem as fungus gnats).
const EFFECTIVE_INSECT_TARGETS = new Set(["pest_tssm", "pest_broadmite", "pest_aphid", "pest_whitefly", "pest_thrips", "pest_mealybug"]);

// Pathogens with spores that float in the air, or reproductive structures
// exposed on the leaf surface and killed once outside the plant --
// powdery mildew is the model case. Botrytis is EXPLICITLY excluded per
// Simon despite superficially fitting that same airborne-spore
// description ("not so great for botrytis"). Root rot (soil-borne, not
// airborne/surface) and HLVd (viral -- "not for viral" per Simon) were
// never candidates.
const EFFECTIVE_PATHOGEN_TARGETS = new Set(["path_pm"]);

const STANDARD_SCHEDULE = "60 minutes, once nightly, automatically in the middle of the dark period.";
const THRIPS_SCHEDULE = "Two 1-hour sessions nightly -- one starting 2 hours into the dark period, one starting 2 hours before it ends.";

export function buildSpectralLightProtocol(program: PestProgram): SpectralLightProtocol {
  if (EFFECTIVE_INSECT_TARGETS.has(program.id)) {
    return {
      applicability: "insect",
      summary:
        program.id === "pest_thrips"
          ? "Small soft-bodied insect -- direct-kill fit. Thrips get a dedicated two-session nightly protocol instead of the standard single dose."
          : "Small soft-bodied insect -- direct-kill fit.",
      schedule: program.id === "pest_thrips" ? THRIPS_SCHEDULE : STANDARD_SCHEDULE,
    };
  }
  if (EFFECTIVE_PATHOGEN_TARGETS.has(program.id)) {
    return {
      applicability: "pathogen",
      summary: "Airborne-spore/surface pathogen -- killed once exposed outside the plant surface.",
      schedule: STANDARD_SCHEDULE,
    };
  }
  return {
    applicability: "not_indicated",
    summary: "Not indicated for this pest/pathogen -- log a treatment from another tier instead.",
    schedule: "",
  };
}
