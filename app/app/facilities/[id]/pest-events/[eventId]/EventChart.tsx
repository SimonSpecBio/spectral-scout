"use client";

import { useState } from "react";
import type { MetricKind } from "@/lib/scout-metric";

type TreatmentType = "pesticide" | "biological" | "spectral_light";

interface MonitoringPoint {
  id: string;
  date: string;
  value: number;
}

interface TreatmentMarker {
  id: string;
  type: TreatmentType;
  product: string | null;
  loggedBy: string | null;
  appliedAt: string;
}

const DAY_MS = 86_400_000;
const W = 360;
const H = 100;
const PAD = 6;
const PLOT_TOP = 8;
const PLOT_BOTTOM = 54;
const DATE_LABEL_Y = 64;
const TREATMENT_ROW_Y = 76;
const DETECTED_LABEL_Y = 92;

// SVG text never wraps -- a long product name (e.g. "Phytoseiulus
// persimilis") runs straight past the tooltip box and off the chart's own
// rendered edge, since the browser clips at the <svg> element's viewport,
// not at the viewBox's coordinate bounds. Truncate rather than widen the
// box indefinitely for an unbounded product name.
function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

// Full-width, tappable-crosshair chart (Airtable ticket B4) -- ports
// PressureGraph's click-to-crosshair/dashed-line/tooltip interaction onto
// the per-event infestation chart, adds a separate tappable row for logged
// treatments, and time-scales the x-axis (rather than evenly spacing by
// array index) so a real gap between detection and the first monitoring
// session shows as visual space instead of being compressed away.
//
// Confirmed against live data before building this: creating a pest event
// never inserts a monitoring session for its own detection (no such insert
// exists in app/api/facilities/[id]/pest-events/route.ts), so a genuinely
// early detection date IS missing from the line today. Rather than invent
// a density/occupancy reading for the moment of detection -- severity is a
// category (low/moderate/high/severe), not a number on this chart's scale,
// and this codebase's rule (see PressureGraph.tsx) is real reconstruction,
// never a fabricated value -- detection only gets a marker, never a point
// on the polyline.
export default function EventChart({
  chronological,
  metricKind,
  threshold,
  presenceTriggered,
  treatments,
  detectedAt,
}: {
  chronological: MonitoringPoint[]; // oldest-first
  metricKind: MetricKind;
  threshold: number;
  presenceTriggered: boolean;
  treatments: TreatmentMarker[];
  detectedAt: string;
}) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [activeTreatment, setActiveTreatment] = useState<string | null>(null);

  const values = chronological.map((s) => s.value);
  const detectedMs = new Date(detectedAt).getTime();
  const sessionMs = chronological.map((s) => new Date(s.date).getTime());
  const treatmentMs = treatments.map((t) => new Date(t.appliedAt).getTime());

  const hasDetectionGap = sessionMs.length === 0 || detectedMs < sessionMs[0];

  const allMs = [...sessionMs, ...treatmentMs, ...(hasDetectionGap ? [detectedMs] : [])];
  const startMs = Math.min(...allMs);
  const endMs = Math.max(...allMs);
  const msSpan = endMs - startMs || DAY_MS;

  const pointX = (ms: number) => PAD + ((ms - startMs) / msSpan) * (W - 2 * PAD);

  const span = Math.max(...values, threshold) - Math.min(...values, threshold) || 1;
  const minAll = Math.min(...values, threshold);
  const pointY = (v: number) => PLOT_BOTTOM - ((v - minAll) / span) * (PLOT_BOTTOM - PLOT_TOP);
  const refY = pointY(threshold);

  function handleChartClick(e: React.MouseEvent<SVGSVGElement>) {
    if (sessionMs.length === 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const localX = (e.clientX - rect.left) * (W / rect.width);
    let nearest = 0;
    let minDist = Infinity;
    for (let i = 0; i < sessionMs.length; i++) {
      const d = Math.abs(pointX(sessionMs[i]) - localX);
      if (d < minDist) {
        minDist = d;
        nearest = i;
      }
    }
    setActiveTreatment(null);
    setActiveIndex((prev) => (prev === nearest ? null : nearest));
  }

  const activeTreatmentData = treatments.find((t) => t.id === activeTreatment) ?? null;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="block w-full" onClick={handleChartClick} style={{ cursor: sessionMs.length > 0 ? "pointer" : "default" }}>
      <g fontFamily="ui-monospace, monospace" fontSize="7" fill="var(--text-faint)">
        <line x1={PAD} y1={refY} x2={W - PAD} y2={refY} stroke="var(--text-faint)" strokeWidth={0.75} strokeDasharray="3 3" />
        <text x={PAD} y={refY - 3}>
          {presenceTriggered ? "Alert on any detection" : metricKind === "density" ? `${threshold}/leaf threshold` : `${threshold}% threshold`}
        </text>
      </g>

      <polyline
        points={chronological.map((s, i) => `${pointX(sessionMs[i])},${pointY(s.value)}`).join(" ")}
        fill="none"
        stroke="var(--danger)"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {chronological.map((s, i) => (
        <circle key={s.id} cx={pointX(sessionMs[i])} cy={pointY(s.value)} r={2.5} fill="var(--danger)" />
      ))}

      {chronological.length > 0 && (
        <g fontFamily="ui-monospace, monospace" fontSize="7" fill="var(--text-faint)">
          <text x={pointX(sessionMs[0])} y={DATE_LABEL_Y} textAnchor="start">
            {new Date(chronological[0].date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
          </text>
          {chronological.length > 1 && (
            <text x={pointX(sessionMs[sessionMs.length - 1])} y={DATE_LABEL_Y} textAnchor="end">
              {new Date(chronological[chronological.length - 1].date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
            </text>
          )}
        </g>
      )}

      {hasDetectionGap && (
        <g>
          <line
            x1={pointX(detectedMs)}
            y1={PLOT_TOP}
            x2={pointX(detectedMs)}
            y2={PLOT_BOTTOM}
            stroke="var(--text-faint)"
            strokeWidth={0.75}
            strokeDasharray="1 2"
          />
          {/* Detection always precedes every other point when this anchor
              renders (that's what hasDetectionGap means), so it always
              lands exactly at the chart's left edge -- start-anchor, never
              middle, or half the label clips off the SVG's own viewport. */}
          <text x={pointX(detectedMs)} y={DETECTED_LABEL_Y} textAnchor="start" fontFamily="ui-monospace, monospace" fontSize="6.5" fill="var(--text-faint)">
            First detected
          </text>
        </g>
      )}

      {treatments.map((t, i) => (
        <g
          key={t.id}
          onClick={(e) => {
            e.stopPropagation();
            setActiveIndex(null);
            setActiveTreatment((prev) => (prev === t.id ? null : t.id));
          }}
          style={{ cursor: "pointer" }}
        >
          <circle cx={pointX(treatmentMs[i])} cy={TREATMENT_ROW_Y} r={6} fill="transparent" />
          <path
            d={`M ${pointX(treatmentMs[i]) - 3} ${TREATMENT_ROW_Y - 3} L ${pointX(treatmentMs[i]) + 3} ${TREATMENT_ROW_Y - 3} L ${pointX(treatmentMs[i])} ${TREATMENT_ROW_Y + 3} Z`}
            fill={activeTreatment === t.id ? "var(--accent)" : "var(--text-dim)"}
          />
        </g>
      ))}

      {activeIndex != null &&
        chronological[activeIndex] &&
        (() => {
          const x = pointX(sessionMs[activeIndex]);
          const y = pointY(chronological[activeIndex].value);
          const boxW = 46;
          const boxX = Math.min(Math.max(x - boxW / 2, PAD), W - PAD - boxW);
          return (
            <g>
              <line x1={x} y1={PLOT_TOP} x2={x} y2={PLOT_BOTTOM} stroke="var(--text-faint)" strokeWidth={0.75} strokeDasharray="2 2" />
              <line x1={PAD} y1={y} x2={W - PAD} y2={y} stroke="var(--text-faint)" strokeWidth={0.75} strokeDasharray="2 2" />
              <circle cx={x} cy={y} r={2.5} fill="var(--danger)" />
              <g transform={`translate(${boxX}, ${Math.max(y - 24, 0)})`}>
                <rect width={boxW} height={20} rx={3} fill="var(--surface-raised)" stroke="var(--border)" strokeWidth={0.5} />
                <text x={boxW / 2} y={9} textAnchor="middle" fontFamily="ui-monospace, monospace" fontSize={7} fill="var(--text)">
                  {metricKind === "density" ? chronological[activeIndex].value.toFixed(1) : `${Math.round(chronological[activeIndex].value)}%`}
                </text>
                <text x={boxW / 2} y={17} textAnchor="middle" fontFamily="ui-monospace, monospace" fontSize={6} fill="var(--text-dim)">
                  {new Date(chronological[activeIndex].date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                </text>
              </g>
            </g>
          );
        })()}

      {activeTreatmentData &&
        (() => {
          const x = pointX(new Date(activeTreatmentData.appliedAt).getTime());
          const boxW = 96;
          const boxX = Math.min(Math.max(x - boxW / 2, PAD), W - PAD - boxW);
          return (
            <g transform={`translate(${boxX}, ${TREATMENT_ROW_Y + 6})`}>
              <rect width={boxW} height={28} rx={3} fill="var(--surface-raised)" stroke="var(--border)" strokeWidth={0.5} />
              <text x={6} y={11} fontFamily="ui-monospace, monospace" fontSize={6.5} fill="var(--text)">
                {truncate(
                  `${activeTreatmentData.type.replace("_", " ")}${activeTreatmentData.product ? `: ${activeTreatmentData.product}` : ""}`,
                  20
                )}
              </text>
              <text x={6} y={20} fontFamily="ui-monospace, monospace" fontSize={6} fill="var(--text-dim)">
                {truncate(
                  `${new Date(activeTreatmentData.appliedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}${
                    activeTreatmentData.loggedBy ? ` · ${activeTreatmentData.loggedBy}` : ""
                  }`,
                  20
                )}
              </text>
            </g>
          );
        })()}
    </svg>
  );
}
