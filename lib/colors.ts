// Shared color maps -- SEVERITY_COLOR was copy-pasted verbatim in four
// files (events/page.tsx, PestEventDetail.tsx, MapEditor.tsx,
// PressureBayMap.tsx) and URGENCY_COLOR in two
// (schedule/page.tsx, schedule/[taskId]/page.tsx). One definition now, so
// a future palette tweak can't update three copies and miss the fourth.

export type Severity = "low" | "moderate" | "high" | "severe";
export const SEVERITY_COLOR: Record<Severity, string> = {
  low: "#e0d24b",
  moderate: "#e0913d",
  high: "#e0553d",
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
