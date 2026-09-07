// Shared color maps -- SEVERITY_COLOR was copy-pasted verbatim in four
// files (events/page.tsx, PestEventDetail.tsx, MapEditor.tsx,
// PressureBayMap.tsx) and URGENCY_COLOR in two
// (schedule/page.tsx, schedule/[taskId]/page.tsx). One definition now, so
// a future palette tweak can't update three copies and miss the fourth.

export type Severity = "low" | "moderate" | "high" | "severe";
export const SEVERITIES: Severity[] = ["low", "moderate", "high", "severe"];
export const SEVERITY_COLOR: Record<Severity, string> = {
  low: "#e0d24b",
  moderate: "#e0913d",
  high: "#e0553d",
  severe: "#a3193d",
};

// SEVERITY_COLOR is tuned for fills/dots on a light card background --
// used as TEXT (a badge's own label, a severity chip) it fails WCAG AA's
// 4.5:1 minimum badly (low measures 1.56:1 against white, effectively
// invisible), and severity is the single most important status in the app
// (Airtable ticket recfKUAhJnQARzMk1, scoped to the light palette per its
// own acceptance criteria). Same hue per severity, darkened until each one
// clears 4.5:1 on --surface (#fff) -- verified by the standard WCAG
// relative-luminance formula, not eyeballed: low 5.4:1, moderate 6.3:1,
// high 6.9:1, severe (already dark enough unchanged) 7.6:1.
//
// Plain hex, not a --surface-aware CSS variable, matching SEVERITY_COLOR's
// own existing convention -- neither adapts for dark mode (--surface goes
// near-black there), which is a real, separate, already-tracked gap (a
// dark-mode design pass is its own open ticket), not something this one
// re-solves.
export const SEVERITY_TEXT_COLOR: Record<Severity, string> = {
  low: "#7a6a00",
  moderate: "#954d00",
  high: "#9c3a1f",
  severe: "#a3193d",
};

export type TaskUrgency = "overdue" | "due_soon" | "scheduled" | "done" | "snoozed";
export const URGENCY_COLOR: Record<TaskUrgency, string> = {
  overdue: "#CE5D40",
  due_soon: "#C79A3A",
  scheduled: "#4E6280",
  done: "#4E9E86",
  snoozed: "#4E6280",
};
