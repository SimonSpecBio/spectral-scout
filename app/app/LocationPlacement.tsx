"use client";

import { useState } from "react";
import { BAYS, bayLabel, CANVAS_H, CANVAS_W, type Bay } from "@/lib/floorplan-bays";

// Placeholder floor plan, same as PressureHeatmapPlaceholder and the same
// deliberate scope: "we'll come to the map fixing perfectly later." This
// still returns *real*, usable coordinates though -- BAYS is canvas-space
// already (lib/floorplan-bays.ts), so the position a bay renders at here
// and the position PressureHeatmapPlaceholder matches real events against
// are provably the same points, not two independently-eyeballed layouts.
const VIEW_W = 296;
const VIEW_H = 400;
const BENCH_W = 86;
const BENCH_H = 9;

function toView(bay: Bay) {
  return { cx: (bay.x / CANVAS_W) * VIEW_W, cy: (bay.y / CANVAS_H) * VIEW_H };
}

export default function LocationPlacement({
  onConfirm,
  onCancel,
}: {
  onConfirm: (x: number, y: number, label: string) => void;
  onCancel: () => void;
}) {
  const [selected, setSelected] = useState<Bay | null>(null);
  // Local, not derived from a parent "submitting" prop -- onConfirm is
  // async (it POSTs and navigates away on success) and this button had no
  // protection against a second tap while that was in flight. On a slow
  // mobile connection with no immediate visual feedback, a second (or
  // third, or seventh) tap each fired a full duplicate event+session
  // creation -- confirmed in the database, not hypothetical.
  const [confirming, setConfirming] = useState(false);

  function confirm() {
    if (!selected || confirming) return;
    setConfirming(true);
    onConfirm(selected.x, selected.y, bayLabel(selected));
  }

  const selectedView = selected ? toView(selected) : null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background: "var(--surface)" }}>
      <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4">
        <button onClick={onCancel} className="text-sm text-[var(--text-dim)]">
          Cancel
        </button>
        <span className="text-sm font-medium">Place location</span>
        <span className="w-9" />
      </div>

      <div className="flex items-center gap-2 border-b border-[var(--border)] px-5 py-3">
        <span className="text-[var(--text-faint)]">&#9757;</span>
        <span className="text-xs text-[var(--text-dim)]">Tap a bench to place</span>
      </div>

      <div className="flex-1 overflow-hidden" style={{ background: "#0a1120" }}>
        <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} preserveAspectRatio="xMidYMid meet" className="block h-full w-full">
          <rect x="38" y="20" width="220" height="360" rx="3" fill="none" stroke="#1e2c46" strokeWidth="1" />
          <line x1="148" y1="24" x2="148" y2="376" stroke="#111c2d" strokeWidth="0.75" strokeDasharray="1 5" />
          {BAYS.map((b) => {
            const { cx, cy } = toView(b);
            const isSelected = selected?.row === b.row && selected?.index === b.index;
            return (
              <rect
                key={`${b.row}${b.index}`}
                x={cx - BENCH_W / 2}
                y={cy - BENCH_H / 2}
                width={BENCH_W}
                height={BENCH_H}
                rx={4.5}
                fill={isSelected ? "#1d2c48" : "#172234"}
                stroke={isSelected ? "var(--accent)" : "none"}
                strokeWidth={1.5}
                onClick={() => setSelected(b)}
                style={{ cursor: "pointer" }}
              />
            );
          })}
          <g fontFamily="ui-monospace, monospace" fontSize="8" letterSpacing="0.14em">
            <text x="50" y="15" fill="#4a5a75">ROW A</text>
            <text x="160" y="15" fill="#4a5a75">ROW B</text>
          </g>
          {selectedView && (
            <>
              <circle cx={selectedView.cx} cy={selectedView.cy} r={16} fill="none" stroke="var(--accent)" strokeWidth={1} opacity={0.5} />
              <circle cx={selectedView.cx} cy={selectedView.cy - 18} r={7} fill="var(--accent)" />
              <path
                d={`M${selectedView.cx} ${selectedView.cy - 11} L${selectedView.cx - 5} ${selectedView.cy} L${selectedView.cx + 5} ${selectedView.cy} Z`}
                fill="var(--accent)"
              />
            </>
          )}
        </svg>
      </div>

      <div className="border-t border-[var(--border)] px-5 pb-6 pt-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span style={{ color: "var(--accent)" }}>&#128205;</span>
            <div>
              <div className="text-sm">{selected ? bayLabel(selected) : "No location selected"}</div>
              {selected && <div className="label-mono">ROW {selected.row} &middot; BENCH {selected.index}</div>}
            </div>
          </div>
          {/* Not wired to a real scanner -- no tag/QR infrastructure exists
              yet, shown for layout fidelity only, disabled rather than fake. */}
          <span className="flex items-center gap-1.5 rounded-lg border border-[var(--border-soft)] px-2.5 py-1.5 text-xs text-[var(--text-faint)] opacity-50">
            Scan tag
          </span>
        </div>
        <button
          onClick={confirm}
          disabled={!selected || confirming}
          className="w-full rounded-xl py-3.5 text-sm font-medium disabled:opacity-40"
          style={{ background: "#25385a", border: "0.5px solid #37507a", color: "var(--text)" }}
        >
          {confirming ? "Setting…" : "Set location"}
        </button>
      </div>
    </div>
  );
}
