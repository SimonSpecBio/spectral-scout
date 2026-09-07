"use client";

import { DISEASE_CLASS_LABELS, diseaseCellLabel, type DiseaseLeaves } from "@/lib/disease";

const POSITIONS = ["Bot", "Mid", "Top"] as const;
// idle-fill for "Unassessed" (also doubles as the Absent class's fill --
// same near-invisible look, distinguished by a solid vs. dashed border),
// then 2 alpha steps and a solid fill for Low/Medium/High.
const CLASS_FILL = ["var(--idle-fill)", "rgba(206,93,64,0.30)", "rgba(206,93,64,0.60)", "#CE5D40"];

// The 10-plant x {bottom,middle,top} leaf-severity grid, shared between
// event creation (new-disease-event/DiseaseEventForm) and ongoing
// monitoring (pest-events/[eventId]/monitoring/DiseaseMonitoringFlow) so
// the two can't drift apart on scale or rendering.
export function DiseaseGridLegend() {
  return (
    <div className="flex flex-wrap gap-3">
      <LegendSwatch fill={CLASS_FILL[0]} border label="Unassessed" />
      {DISEASE_CLASS_LABELS.map((label, i) => (
        <LegendSwatch key={label} fill={CLASS_FILL[i]} label={label} />
      ))}
    </div>
  );
}

export function DiseaseGrid({ grid, onToggle }: { grid: DiseaseLeaves[]; onToggle: (row: number, col: number) => void }) {
  return (
    <>
      <div className="grid grid-cols-[26px_1fr_1fr_1fr] gap-1.5">
        <span />
        {POSITIONS.map((p) => (
          <span key={p} className="text-center text-[8px] font-mono uppercase text-[var(--text-faint)]">
            {p}
          </span>
        ))}
      </div>
      <div className="flex flex-col gap-1.5">
        {grid.map((row, r) => (
          <div key={r} className="grid grid-cols-[26px_1fr_1fr_1fr] items-center gap-1.5">
            <span className="text-[9px] font-mono text-[var(--text-faint)]">{String(r + 1).padStart(2, "0")}</span>
            {row.map((cell, c) => (
              <button
                type="button"
                key={c}
                onClick={() => onToggle(r, c)}
                className="flex min-h-11 items-center justify-center rounded-md text-[8px] font-mono font-medium"
                style={{
                  background: cell === null ? "transparent" : CLASS_FILL[cell],
                  border: cell === null ? "0.5px dashed var(--border-soft)" : cell === 0 ? "0.5px solid var(--border-soft)" : "0.5px solid transparent",
                  color: cell !== null && cell > 0 ? "var(--on-accent)" : "var(--text-dim)",
                }}
              >
                {cell !== null && diseaseCellLabel(cell)}
              </button>
            ))}
          </div>
        ))}
      </div>
    </>
  );
}

function LegendSwatch({ fill, label, border }: { fill: string; label: string; border?: boolean }) {
  return (
    <span className="flex items-center gap-1.5 text-[9px] text-[var(--text-dim)]">
      <span className="h-2.5 w-2.5 rounded-sm" style={{ background: fill, border: border ? "0.5px solid var(--border-soft)" : undefined }} />
      {label}
    </span>
  );
}
