"use client";

import { useEffect, useState } from "react";
import { sparkPoints } from "@/lib/density";

type Severity = "low" | "moderate" | "high" | "severe";
const SEVERITY_WEIGHT: Record<Severity, number> = { low: 1, moderate: 2, high: 3, severe: 4 };
const DAY_MS = 86_400_000;

interface EventInput {
  createdAt: Date;
  resolvedAt: Date | null;
  severity: Severity;
}

// Real reconstruction, not fabricated: for each of the last 7 days, sum the
// severity weight of every event that was active on that day (created by
// end of day, not yet resolved by start of day) using pest_events' actual
// timestamps. No made-up "threshold" line -- there's no real economic-
// threshold concept in the data yet, so this only shows what's actually
// knowable: the trend itself, and the change over the window.
const WEEKDAY_LETTER = ["S", "M", "T", "W", "T", "F", "S"];

// Small, unobtrusive range control -- events itself is already the org's
// full unbounded pest-event history (page.tsx has no date filter on that
// query), so widening the window is just changing how many days this
// reconstructs from data already in hand, not a new fetch/prop.
type RangeOption = 7 | 30 | "all";
const RANGE_OPTIONS: { value: RangeOption; label: string }[] = [
  { value: 7, label: "7d" },
  { value: 30, label: "30d" },
  { value: "all", label: "All" },
];

export default function PressureGraph({ events }: { events: EventInput[] }) {
  const [showAxisInfo, setShowAxisInfo] = useState(false);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [range, setRange] = useState<RangeOption>(7);
  // This whole reconstruction anchors on "today" -- computing that directly
  // in the render body is a confirmed hydration-mismatch source (React
  // error #418): this Client Component still gets server-rendered once
  // (the SERVER's timezone, UTC on Vercel) before hydrating in the
  // browser (the visitor's real timezone), and "today" can be a different
  // calendar date between the two whenever the visitor is far enough west
  // of UTC. Deferring the real chart to after mount keeps the first
  // client render identical to the server's (both the placeholder below).
  const [mounted, setMounted] = useState(false);
  // Same justified "flip to true once mounted" pattern as app/app/LocalDate.tsx.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMounted(true), []);
  if (!mounted) {
    return (
      <div className="card p-4">
        <div className="mb-2 flex items-center justify-between">
          <span className="label-mono">Pest pressure</span>
        </div>
        <div style={{ height: 72 }} />
      </div>
    );
  }

  const today = new Date();
  today.setHours(23, 59, 59, 999);

  const earliestEventMs = events.length > 0 ? Math.min(...events.map((e) => e.createdAt.getTime())) : today.getTime();
  const daysSinceEarliest = Math.max(1, Math.ceil((today.getTime() - earliestEventMs) / DAY_MS) + 1);
  const numDays = range === "all" ? daysSinceEarliest : range;

  const days: number[] = [];
  const dayLabels: string[] = [];
  for (let i = numDays - 1; i >= 0; i--) {
    const dayEnd = new Date(today.getTime() - i * DAY_MS);
    const dayStart = new Date(dayEnd);
    dayStart.setHours(0, 0, 0, 0);
    const pressure = events
      .filter((e) => e.createdAt <= dayEnd && (e.resolvedAt == null || e.resolvedAt >= dayStart))
      .reduce((sum, e) => sum + SEVERITY_WEIGHT[e.severity], 0);
    days.push(pressure);
    // A single weekday letter only disambiguates within one week -- past 7
    // days it repeats (two Tuesdays both show "T") and no longer actually
    // identifies which calendar day it is, which is what the 30d/All ranges
    // need it to do.
    dayLabels.push(numDays <= 7 ? WEEKDAY_LETTER[dayStart.getDay()] : `${dayStart.getMonth() + 1}/${dayStart.getDate()}`);
  }

  const latest = days[days.length - 1];
  const baseline = days[0];
  const delta = latest - baseline;
  const max = Math.max(...days, 1);
  // Every weekday letter at 7 days is readable; past that it's just visual
  // noise (30+ crammed single letters) -- thin to about 6 evenly-spaced
  // labels instead once the range grows. `numDays / 6` alone hit 7 days
  // itself (ceil(7/6) = 2), thinning out the exact range the comment above
  // says should show every label -- gate it so nothing thins until past 7.
  const labelStride = numDays <= 7 ? 1 : Math.ceil(numDays / 6);
  // Always showing every `labelStride`th index *and* unconditionally forcing
  // in the very last index produced two labels crammed right next to each
  // other whenever the last stride-multiple landed one or two days short of
  // the end -- the "garbled" overlapping text QA found on the All-time
  // range. Swap the nearest stride-multiple out for the true last day
  // instead of showing both when they'd land within half a stride of each
  // other.
  const labelIndices = new Set<number>();
  for (let i = 0; i < numDays; i += labelStride) labelIndices.add(i);
  const lastIdx = numDays - 1;
  if (!labelIndices.has(lastIdx)) {
    const prevIncluded = Math.max(...labelIndices);
    if (lastIdx - prevIncluded < labelStride / 2) labelIndices.delete(prevIncluded);
    labelIndices.add(lastIdx);
  }

  // Same w/h/pad the polyline below is drawn with (sparkPoints(days, 226, 44,
  // 4)) -- replicated here (not imported from sparkPoints, which only
  // returns the joined points string) so the crosshair lands exactly on the
  // point a tap was nearest to, not a slightly-off approximation.
  const CHART_W = 226, CHART_H = 44, PAD = 4;
  const minDay = Math.min(...days);
  const maxDay = Math.max(...days);
  const span = maxDay - minDay || 1;
  const pointX = (i: number) => PAD + (i * (CHART_W - 2 * PAD)) / (days.length - 1);
  const pointY = (v: number) => CHART_H - PAD - ((v - minDay) / span) * (CHART_H - 2 * PAD);

  function handleChartClick(e: React.MouseEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const localX = ((e.clientX - rect.left) * (252 / rect.width)) - 22;
    let nearest = 0;
    let minDist = Infinity;
    for (let i = 0; i < days.length; i++) {
      const d = Math.abs(pointX(i) - localX);
      if (d < minDist) {
        minDist = d;
        nearest = i;
      }
    }
    setShowAxisInfo(false);
    setActiveIndex((prev) => (prev === nearest ? null : nearest));
  }

  return (
    <div className="card p-4">
      <div className="mb-2 flex items-center justify-between">
        <span className="label-mono">Pest pressure</span>
        <div className="flex items-center gap-2">
          {delta !== 0 && (
            <span className="label-mono" style={{ color: delta > 0 ? "var(--danger)" : "var(--success)" }}>
              {delta > 0 ? "▲" : "▼"} {Math.abs(delta)}
            </span>
          )}
          <div className="flex gap-1">
            {RANGE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => {
                  setActiveIndex(null);
                  setRange(opt.value);
                }}
                className="label-mono px-1"
                style={{ color: range === opt.value ? "var(--text)" : "var(--text-faint)" }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>
      <svg viewBox="0 0 252 72" className="block w-full" onClick={handleChartClick} style={{ cursor: "pointer" }}>
        <g fontFamily="ui-monospace, monospace" fontSize="8" fill="var(--map-label)">
          <text
            x="0"
            y="12"
            onClick={(e) => {
              e.stopPropagation();
              setActiveIndex(null);
              setShowAxisInfo((v) => !v);
            }}
          >
            {max}
          </text>
          <text x="0" y="56">0</text>
        </g>
        <g stroke="var(--map-grid-stroke)" strokeWidth="0.5">
          <line x1="22" y1="8" x2="252" y2="8" />
          <line x1="22" y1="52" x2="252" y2="52" />
        </g>
        <polyline
          points={sparkPoints(days, 226, 44, 4)}
          fill="none"
          stroke="var(--danger)"
          strokeWidth="1"
          strokeLinecap="round"
          strokeLinejoin="round"
          transform="translate(22, 4)"
        />
        <g fontFamily="ui-monospace, monospace" fontSize="7" fill="var(--map-label-dim)" textAnchor="middle">
          {dayLabels.map((label, i) =>
            labelIndices.has(i) ? (
              <text key={i} x={22 + 4 + (i * 218) / (numDays - 1 || 1)} y="68">
                {label}
              </text>
            ) : null
          )}
        </g>

        {activeIndex != null && (() => {
          const x = 22 + pointX(activeIndex);
          const y = 4 + pointY(days[activeIndex]);
          const boxX = Math.min(Math.max(x - 12, 22), 252 - 24);
          return (
            <g>
              <line x1={x} y1={8} x2={x} y2={52} stroke="var(--text-faint)" strokeWidth="0.75" strokeDasharray="2 2" />
              <line x1={22} y1={y} x2={252} y2={y} stroke="var(--text-faint)" strokeWidth="0.75" strokeDasharray="2 2" />
              <circle cx={x} cy={y} r={2.5} fill="var(--danger)" />
              <g transform={`translate(${boxX}, ${Math.max(y - 17, 0)})`}>
                <rect width="24" height="13" rx="3" fill="var(--surface-raised)" stroke="var(--border)" strokeWidth="0.5" />
                <text x="12" y="9.5" textAnchor="middle" fontFamily="ui-monospace, monospace" fontSize="8" fill="var(--text)">
                  {days[activeIndex]}
                </text>
              </g>
            </g>
          );
        })()}

        {showAxisInfo && (
          <g transform="translate(0, 16)">
            <rect width="200" height="26" rx="3" fill="var(--surface-raised)" stroke="var(--border)" strokeWidth="0.5" />
            <text fontFamily="ui-monospace, monospace" fontSize="6.5" fill="var(--text-dim)">
              <tspan x="6" y="11">Severity score, not a pest count --</tspan>
              <tspan x="6" y="20">each outbreak adds 1(low)-4(severe)</tspan>
            </text>
          </g>
        )}
      </svg>
    </div>
  );
}
