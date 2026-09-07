"use client";

import type { LeafState, PlantLeaves } from "@/lib/density";

export const POSITIONS = ["Top", "Middle", "Bottom"] as const;
const CYCLE: LeafState[] = ["unchecked", "absent", "low", "medium", "high"];
const STATE_LABEL: Record<LeafState, string> = { unchecked: "", absent: "Absent", low: "Low", medium: "Medium", high: "High" };

export function cycleLeafState(s: LeafState): LeafState {
  return CYCLE[(CYCLE.indexOf(s) + 1) % CYCLE.length];
}

// The 10-plant x {top,middle,bottom} presence/severity grid, shared between
// ongoing monitoring (MonitoringFlow) and pest event creation's detailed
// logging method (new-event/NewEventForm) so the two can't drift apart.
export function PestLeafGrid({ grid, onToggle }: { grid: PlantLeaves[]; onToggle: (plant: number, leaf: number) => void }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
      {grid.map((leaves, p) => {
        const done = leaves.every((s) => s !== "unchecked");
        return (
          <div key={p} className="flex flex-col gap-1 rounded-lg border border-[var(--border)] p-2">
            <div className="flex items-center justify-between text-xs text-[var(--text-dim)]">
              Plant {p + 1}
              {done && <span className="text-[var(--accent-text)]">✓</span>}
            </div>
            {leaves.map((s, l) => (
              <button
                type="button"
                key={l}
                onClick={() => onToggle(p, l)}
                className="flex min-h-11 items-center justify-between rounded-md px-2 text-xs"
                style={{
                  background:
                    s === "unchecked"
                      ? "transparent"
                      : s === "absent"
                        ? "var(--idle-fill)"
                        : s === "low"
                          ? "#6bb77b55"
                          : s === "medium"
                            ? "#e8b84b66"
                            : "#d96b6b77",
                  border: s === "unchecked" ? "1px dashed var(--border)" : "1px solid transparent",
                }}
              >
                <span className="text-[var(--text-dim)]">{POSITIONS[l]}</span>
                <span>{STATE_LABEL[s] || "·"}</span>
              </button>
            ))}
          </div>
        );
      })}
    </div>
  );
}
