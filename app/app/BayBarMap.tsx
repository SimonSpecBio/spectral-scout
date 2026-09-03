"use client";

import { useState } from "react";
import { BAYS } from "@/lib/floorplan-bays";

const IDLE_FILL = "var(--idle-fill)";
const MIN_ZOOM = 1;
const MAX_ZOOM = 2.5;

// The shared bay-bar canvas underneath every dashboard map lens (Pests,
// Last scouted, Temp, Humidity) -- same 20 shared bay slots, same layout,
// just a different fill/badge per bay depending which lens is selected.
// Extracted from what was PressureBayMap's pests-only rendering so the
// other three lenses don't reimplement this SVG from scratch.
export default function BayBarMap({
  colorByBay,
  badgeByBay,
  glowBar,
  hrefByBay,
}: {
  colorByBay: Map<string, string>;
  badgeByBay?: Map<string, string>;
  glowBar?: { x: number; y: number } | null;
  // Only set for the Pests lens -- a bay with an active event links straight
  // to that event's detail page, so tapping the outbreak on the map is the
  // same as tapping it in the Attention Required list.
  hrefByBay?: Map<string, string>;
}) {
  // Explicit +/- zoom (ticket C2) replaces the native pinch-zoom this page
  // disables app-wide -- a simple CSS scale is enough here (unlike
  // MapEditor's Konva canvas, there's no drag/resize editing to keep
  // working underneath it, just a fixed abstract chart).
  const [zoom, setZoom] = useState(1);
  const rowA = BAYS.filter((b) => b.row === "A");
  const rowB = BAYS.filter((b) => b.row === "B");
  const barYs = [32, 60, 88, 116, 144, 172, 200, 228, 256, 284];

  const fillFor = (bay: (typeof BAYS)[number]) => colorByBay.get(`${bay.row}${bay.index}`) ?? IDLE_FILL;
  const badgeFor = (bay: (typeof BAYS)[number]) => badgeByBay?.get(`${bay.row}${bay.index}`);
  const hrefFor = (bay: (typeof BAYS)[number]) => hrefByBay?.get(`${bay.row}${bay.index}`);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 self-end">
        <button
          type="button"
          onClick={() => setZoom((z) => Math.max(MIN_ZOOM, z - 0.25))}
          disabled={zoom <= MIN_ZOOM}
          className="rounded-md border border-[var(--border)] px-2 py-0.5 text-xs text-[var(--text-dim)] disabled:opacity-40"
        >
          −
        </button>
        <span className="label-mono w-8 text-center text-xs">{Math.round(zoom * 100)}%</span>
        <button
          type="button"
          onClick={() => setZoom((z) => Math.min(MAX_ZOOM, z + 0.25))}
          disabled={zoom >= MAX_ZOOM}
          className="rounded-md border border-[var(--border)] px-2 py-0.5 text-xs text-[var(--text-dim)] disabled:opacity-40"
        >
          +
        </button>
      </div>
      <div className="overflow-auto" style={{ background: "var(--map-canvas-bg)", borderRadius: "var(--radius-md)" }}>
        <svg
          viewBox="0 0 296 322"
          className="block"
          style={{ width: `${zoom * 100}%`, minWidth: zoom === 1 ? "100%" : `${zoom * 100}%` }}
        >
          <defs>
            <radialGradient id="heatGlow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="var(--danger)" stopOpacity="0.34" />
              <stop offset="55%" stopColor="var(--danger)" stopOpacity="0.08" />
              <stop offset="100%" stopColor="var(--danger)" stopOpacity="0" />
            </radialGradient>
          </defs>
          <g fontFamily="ui-monospace, monospace" fontSize="7.5" fill="var(--map-label)">
            <text x="16" y="54">01</text>
            <text x="16" y="110">02</text>
            <text x="16" y="166">03</text>
            <text x="16" y="222">04</text>
            <text x="16" y="278">05</text>
          </g>
          <g stroke="var(--map-grid-stroke)" strokeWidth="0.5">
            <line x1="14" y1="82" x2="284" y2="82" />
            <line x1="14" y1="138" x2="284" y2="138" />
            <line x1="14" y1="194" x2="284" y2="194" />
            <line x1="14" y1="250" x2="284" y2="250" />
            <line x1="14" y1="306" x2="284" y2="306" />
          </g>
          <rect x="38" y="18" width="246" height="288" rx="3" fill="none" stroke="var(--map-frame-stroke)" strokeWidth="1" />
          <line x1="161" y1="22" x2="161" y2="302" stroke="var(--map-grid-stroke)" strokeWidth="0.75" strokeDasharray="1 5" />
          {glowBar && <circle cx={glowBar.x} cy={glowBar.y} r={62} fill="url(#heatGlow)" />}
          <g>
            {rowA.map((bay, i) => {
              const href = hrefFor(bay);
              const bar = (
                <>
                  {/* Invisible, taller hit target -- the visible bar is only
                      8px, too small to tap reliably on a phone. */}
                  {href && <rect x="50" y={barYs[i] - 10} width="98" height="28" fill="transparent" />}
                  <rect x="50" y={barYs[i]} width="98" height="8" rx="4" fill={fillFor(bay)} />
                  {badgeFor(bay) && (
                    <text x="144" y={barYs[i] - 2} fontFamily="ui-monospace, monospace" fontSize="7" fill="var(--map-label-dim)" textAnchor="end">
                      {badgeFor(bay)}
                    </text>
                  )}
                </>
              );
              return href ? (
                <a key={`A${bay.index}`} href={href} style={{ cursor: "pointer" }}>
                  {bar}
                </a>
              ) : (
                <g key={`A${bay.index}`}>{bar}</g>
              );
            })}
            {rowB.map((bay, i) => {
              const href = hrefFor(bay);
              const bar = (
                <>
                  {href && <rect x="174" y={barYs[i] - 10} width="98" height="28" fill="transparent" />}
                  <rect x="174" y={barYs[i]} width="98" height="8" rx="4" fill={fillFor(bay)} />
                  {badgeFor(bay) && (
                    <text x="268" y={barYs[i] - 2} fontFamily="ui-monospace, monospace" fontSize="7" fill="var(--map-label-dim)" textAnchor="end">
                      {badgeFor(bay)}
                    </text>
                  )}
                </>
              );
              return href ? (
                <a key={`B${bay.index}`} href={href} style={{ cursor: "pointer" }}>
                  {bar}
                </a>
              ) : (
                <g key={`B${bay.index}`}>{bar}</g>
              );
            })}
          </g>
          {/* Centered over each column's own bars (x=50..148 for A, x=174..272
              for B -- same column widths the bars below use) instead of
              left-aligned from the column's edge, and moved up a few px
              closer to the canvas top so the gap above the frame roughly
              matches the ~14px gap the last bar row already has below it
              (ticket found in QA, 2026-09-03: top gap read noticeably
              tighter than the bottom one). */}
          <g fontFamily="ui-monospace, monospace" fontSize="8" letterSpacing="0.14em" fill="var(--map-label)" textAnchor="middle">
            <text x="99" y="9">ROW A</text>
            <text x="223" y="9">ROW B</text>
          </g>
        </svg>
      </div>
    </div>
  );
}
