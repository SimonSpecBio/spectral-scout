"use client";

import { useState } from "react";

// Placeholder floor plan, same as PressureHeatmapPlaceholder and the same
// deliberate scope: "we'll come to the map fixing perfectly later." This
// still returns *real*, usable coordinates though -- the tapped bench's
// position gets mapped from this component's own viewBox into the same
// 900x600 space the real Konva map uses, so a pin placed here already
// lands somewhere sensible once the real per-site floor plan exists,
// instead of being thrown away.
const VIEW_W = 296;
const VIEW_H = 400;
const CANVAS_W = 900;
const CANVAS_H = 600;
const BENCH_W = 86;
const BENCH_H = 9;
const BENCH_YS = [34, 66, 98, 130, 162, 194, 226, 258, 290, 322];
const ROWS = [
  { key: "A", x: 50 },
  { key: "B", x: 160 },
] as const;

interface Bench {
  row: "A" | "B";
  index: number; // 1-based within the row
  cx: number;
  cy: number;
}

const BENCHES: Bench[] = ROWS.flatMap((row) =>
  BENCH_YS.map((y, i) => ({ row: row.key, index: i + 1, cx: row.x + BENCH_W / 2, cy: y + BENCH_H / 2 }))
);

export default function LocationPlacement({
  onConfirm,
  onCancel,
}: {
  onConfirm: (x: number, y: number, label: string) => void;
  onCancel: () => void;
}) {
  const [selected, setSelected] = useState<Bench | null>(null);

  function confirm() {
    if (!selected) return;
    const x = (selected.cx / VIEW_W) * CANVAS_W;
    const y = (selected.cy / VIEW_H) * CANVAS_H;
    onConfirm(x, y, `Bay ${selected.row}${selected.index}`);
  }

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
          {BENCHES.map((b) => {
            const isSelected = selected?.row === b.row && selected?.index === b.index;
            return (
              <rect
                key={`${b.row}${b.index}`}
                x={b.cx - BENCH_W / 2}
                y={b.cy - BENCH_H / 2}
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
          {selected && (
            <>
              <circle cx={selected.cx} cy={selected.cy} r={16} fill="none" stroke="var(--accent)" strokeWidth={1} opacity={0.5} />
              <circle cx={selected.cx} cy={selected.cy - 18} r={7} fill="var(--accent)" />
              <path d={`M${selected.cx} ${selected.cy - 11} L${selected.cx - 5} ${selected.cy} L${selected.cx + 5} ${selected.cy} Z`} fill="var(--accent)" />
            </>
          )}
        </svg>
      </div>

      <div className="border-t border-[var(--border)] px-5 pb-6 pt-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span style={{ color: "var(--accent)" }}>&#128205;</span>
            <div>
              <div className="text-sm">{selected ? `Bay ${selected.row}${selected.index}` : "No location selected"}</div>
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
          disabled={!selected}
          className="w-full rounded-xl py-3.5 text-sm font-medium disabled:opacity-40"
          style={{ background: "#25385a", border: "0.5px solid #37507a", color: "var(--text)" }}
        >
          Set location
        </button>
      </div>
    </div>
  );
}
