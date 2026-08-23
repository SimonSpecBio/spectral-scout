import { PESTS } from "./treatments-catalog";

export interface PreventiveChecklistItem {
  pestId: string;
  commonName: string;
  kind: "pest" | "pathogen";
  items: string[];
}

// A generic starter checklist for growers with no facility history yet --
// the personalized "this facility's own history writes its preventive
// playbook" idea (FUTURE_FEATURES_THEORIZING.md #9) only works once real
// history accumulates, so this covers the gap before that. Reuses the
// catalog's existing, already-sourced PestProgram.preventive bullets
// (the same list RecommendationsPanel shows reactively after a pest event
// exists) rather than inventing new "week N" content this app has no
// cycle-start-date data to actually back up.
export function preventiveChecklist(): PreventiveChecklistItem[] {
  return PESTS.filter((p) => p.preventive.length > 0).map((p) => ({
    pestId: p.id,
    commonName: p.commonName,
    kind: p.kind,
    items: p.preventive,
  }));
}
