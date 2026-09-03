"use client";

import { useEffect, useRef } from "react";

const ITEM_H = 32; // px -- each wheel's row height, also its scroll-snap unit

// A native-scroll wheel, not a hand-rolled drag tracker: each column is a
// vertically scrollable list with CSS scroll-snap-align, so touch drag,
// mouse-wheel, and momentum all come from the browser for free instead of
// custom pointer-event math. Padding top/bottom (one row's worth) lets the
// FIRST and LAST values still center in the visible window. Detecting
// "which value is selected" just means finding the row nearest scrollTop
// at scroll-end (debounced), then snapping there and firing onChange.
function Wheel({
  values,
  selected,
  onSelect,
  labelWidth,
  formatLabel,
}: {
  values: number[];
  selected: number;
  onSelect: (v: number) => void;
  labelWidth: string;
  formatLabel?: (v: number) => string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const scrollTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  // True only while this wheel's own onSelect just moved it -- otherwise a
  // value change coming from OUTSIDE (a restored draft, a linked field)
  // needs to re-scroll the wheel to match, but scrollTo() itself fires a
  // scroll event that would otherwise loop back through handleScroll and
  // re-fire onSelect right back at the caller.
  const settledIndex = useRef<number | null>(null);

  useEffect(() => {
    const index = values.indexOf(selected);
    if (index === -1 || index === settledIndex.current) return;
    ref.current?.scrollTo({ top: index * ITEM_H, behavior: settledIndex.current == null ? "auto" : "smooth" });
    settledIndex.current = index;
  }, [selected, values]);

  function handleScroll() {
    if (scrollTimeout.current) clearTimeout(scrollTimeout.current);
    scrollTimeout.current = setTimeout(() => {
      const el = ref.current;
      if (!el) return;
      const index = Math.round(el.scrollTop / ITEM_H);
      const clamped = Math.max(0, Math.min(values.length - 1, index));
      settledIndex.current = clamped;
      el.scrollTo({ top: clamped * ITEM_H, behavior: "smooth" });
      if (values[clamped] !== selected) onSelect(values[clamped]);
    }, 120);
  }

  return (
    <div
      ref={ref}
      onScroll={handleScroll}
      className="hide-scrollbar overflow-y-scroll"
      style={{ height: ITEM_H * 3, scrollSnapType: "y mandatory", width: labelWidth }}
    >
      <div style={{ height: ITEM_H }} />
      {values.map((v) => (
        <div
          key={v}
          onClick={() => onSelect(v)}
          className="flex cursor-pointer items-center justify-center font-mono text-sm"
          style={{
            height: ITEM_H,
            scrollSnapAlign: "center",
            color: v === selected ? "var(--text)" : "var(--text-faint)",
            fontWeight: v === selected ? 600 : 400,
          }}
        >
          {formatLabel ? formatLabel(v) : String(v).padStart(2, "0")}
        </div>
      ))}
      <div style={{ height: ITEM_H }} />
    </div>
  );
}

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MINUTES_5 = Array.from({ length: 12 }, (_, i) => i * 5);
// These wheels are durations (mins after dark, application duration), not
// clock times -- there's no AM/PM to show, but a 12-hour dial (1-12,
// wrapping) still reads more naturally than a 24-hour one.
const hour12Label = (h: number) => String(h % 12 === 0 ? 12 : h % 12);

export interface TimePickerProps {
  valueMinutes: number;
  onChange: (minutes: number) => void;
  // hoursMinutes: two wheels (H : MM), minutes wrap into hours -- for
  // fields that can meaningfully run over an hour (total application
  // time). minutesOnly: one wheel of raw minutes at `step` increments,
  // capped at `maxMinutes` -- for short spectral-timing fields
  // (minutesAfterDark, durationMin), which the plan's own research
  // described as "typically under 120."
  mode?: "hoursMinutes" | "minutesOnly";
  maxMinutes?: number;
  step?: number;
}

// Replaces the raw number input / Stepper previously used for every
// "minutes spent" and spectral-timing field (Airtable ticket B2) -- an
// iOS-style scrollable wheel, defaulting to 00:00, not a typed number.
export default function TimePicker({ valueMinutes, onChange, mode = "hoursMinutes", maxMinutes = 180, step = 5 }: TimePickerProps) {
  if (mode === "minutesOnly") {
    const values = Array.from({ length: Math.floor(maxMinutes / step) + 1 }, (_, i) => i * step);
    const nearest = values.reduce((best, v) => (Math.abs(v - valueMinutes) < Math.abs(best - valueMinutes) ? v : best), values[0]);
    return (
      <div className="relative flex items-center justify-center gap-1 rounded-md border border-[var(--border)] bg-transparent px-2">
        <div className="pointer-events-none absolute inset-x-2 top-1/2 h-8 -translate-y-1/2 rounded border border-[var(--border)]" />
        <Wheel values={values} selected={nearest} onSelect={onChange} labelWidth="2.5rem" />
        <span className="text-xs text-[var(--text-dim)]">min</span>
      </div>
    );
  }

  const hours = Math.floor(valueMinutes / 60);
  const minutes = valueMinutes % 60;
  const nearestMinute = MINUTES_5.reduce((best, v) => (Math.abs(v - minutes) < Math.abs(best - minutes) ? v : best), 0);

  return (
    <div className="relative flex items-center justify-center gap-1 rounded-md border border-[var(--border)] bg-transparent px-2">
      <div className="pointer-events-none absolute inset-x-2 top-1/2 h-8 -translate-y-1/2 rounded border border-[var(--border)]" />
      <Wheel values={HOURS} selected={hours} onSelect={(h) => onChange(h * 60 + nearestMinute)} labelWidth="2rem" formatLabel={hour12Label} />
      <span className="text-sm text-[var(--text-dim)]">:</span>
      <Wheel values={MINUTES_5} selected={nearestMinute} onSelect={(m) => onChange(hours * 60 + m)} labelWidth="2rem" />
    </div>
  );
}
