"use client";

function round(n: number) {
  return Math.round(n * 100) / 100;
}

// Shared +/- tap-target control for field-entered numerics -- a large hit
// area beats a raw <input type="number"> for wet/gloved-finger field use.
// Was previously duplicated inline in CountsFlow, CompleteTaskForm, and
// LogTrapReadingsForm; this is that same pattern, pulled out so
// MonitoringFlow/NewTreatmentForm can reuse it instead of adding a fourth
// copy.
export function Stepper({
  value,
  onChange,
  min = 0,
  max,
  step = 1,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
}) {
  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={() => onChange(Math.max(min, round(value - step)))}
        className="flex h-8 w-8 items-center justify-center rounded-md border border-[var(--border)] text-[var(--text-dim)]"
      >
        −
      </button>
      <span className="w-10 text-center text-sm tabular-nums">{value}</span>
      <button
        type="button"
        onClick={() => onChange(max != null ? Math.min(max, round(value + step)) : round(value + step))}
        className="flex h-8 w-8 items-center justify-center rounded-md border border-[var(--border)] text-[var(--text-dim)]"
      >
        +
      </button>
    </div>
  );
}

// Same control for fields that start out "not entered" rather than zero --
// 0 is a real, meaningfully different reading for things like temperature
// or humidity (unlike a trap count or minutes-spent, where 0 and "unset"
// mean the same thing), so this can't just default to 0 like Stepper does.
// The first tap seeds the value at `start` (the old input's placeholder)
// instead of stepping up from zero.
export function OptionalStepper({
  value,
  onChange,
  start,
  min = 0,
  max,
  step = 1,
}: {
  value: number | "";
  onChange: (v: number) => void;
  start: number;
  min?: number;
  max?: number;
  step?: number;
}) {
  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={() => value !== "" && onChange(Math.max(min, round(value - step)))}
        disabled={value === ""}
        className="flex h-8 w-8 items-center justify-center rounded-md border border-[var(--border)] text-[var(--text-dim)] disabled:opacity-30"
      >
        −
      </button>
      <span className="w-10 text-center text-sm tabular-nums">{value === "" ? "–" : value}</span>
      <button
        type="button"
        onClick={() => onChange(value === "" ? start : max != null ? Math.min(max, round(value + step)) : round(value + step))}
        className="flex h-8 w-8 items-center justify-center rounded-md border border-[var(--border)] text-[var(--text-dim)]"
      >
        +
      </button>
    </div>
  );
}
