"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

// Fixed protocol for v1 -- 10 plants x 3 leaf positions = 30 tap-through
// readings, matching the design brief exactly. Configurable plant counts /
// custom protocols are a real feature but not needed to prove this out;
// hardcoding keeps the guided flow itself (the actual point) simple.
const PLANT_COUNT = 10;
const POSITIONS = ["Top", "Middle", "Bottom"] as const;
const TOTAL = PLANT_COUNT * POSITIONS.length;

const LEVELS = [
  { label: "None", value: 0, color: "#7fb87a" },
  { label: "Low", value: 1, color: "#d9c15b" },
  { label: "Moderate", value: 2, color: "#d98f41" },
  { label: "Heavy", value: 3, color: "#c14b4b" },
] as const;

// Generic tap-through protocol -- used both from within a Pest Event's
// Monitoring tab (postUrl targets that event, session gets linked via
// promotedPestEventId) and from the global "+" quick action for routine,
// unlinked scouting (postUrl targets the area directly). Same 30-tap flow
// either way; only where the result gets posted/redirected differs.
export default function MonitoringFlow({ postUrl, redirectHref }: { postUrl: string; redirectHref: string }) {
  const router = useRouter();
  const [started, setStarted] = useState(false);
  const [readings, setReadings] = useState<number[]>([]);
  const [saving, setSaving] = useState(false);

  const index = readings.length;
  const done = index >= TOTAL;
  const plant = Math.floor(index / POSITIONS.length) + 1;
  const position = POSITIONS[index % POSITIONS.length];

  const pestCount = readings.reduce((sum, v) => sum + v, 0);
  const infestationPct = readings.length ? Math.round((readings.filter((v) => v > 0).length / readings.length) * 100) : 0;

  function record(value: number) {
    setReadings((prev) => [...prev, value]);
  }

  async function save() {
    setSaving(true);
    const res = await fetch(postUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sampleSize: TOTAL, pestCount }),
    });
    setSaving(false);
    if (res.ok) router.push(redirectHref);
  }

  if (!started) {
    return (
      <div className="card flex flex-col items-center gap-4 p-8 text-center">
        <div className="text-lg font-medium">Monitoring protocol</div>
        <div className="text-sm text-[var(--text-dim)]">
          {PLANT_COUNT} plants x {POSITIONS.join("/")} leaf = {TOTAL} observations. Rate each leaf, tap through --
          about a minute.
        </div>
        <button onClick={() => setStarted(true)} className="rounded-md bg-[var(--accent)] px-6 py-3 font-medium text-[#0B1626]">
          Start monitoring
        </button>
      </div>
    );
  }

  if (done) {
    return (
      <div className="card flex flex-col items-center gap-4 p-8 text-center">
        <div className="text-lg font-medium">Session complete</div>
        <div className="flex gap-8">
          <div>
            <div className="text-3xl font-semibold">{(pestCount / TOTAL).toFixed(2)}</div>
            <div className="text-sm text-[var(--text-dim)]">density / sample unit</div>
          </div>
          <div>
            <div className="text-3xl font-semibold">{infestationPct}%</div>
            <div className="text-sm text-[var(--text-dim)]">of leaves affected</div>
          </div>
        </div>
        <button
          onClick={save}
          disabled={saving}
          className="rounded-md bg-[var(--accent)] px-6 py-3 font-medium text-[#0B1626] disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save session"}
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between text-sm text-[var(--text-dim)]">
        <span>
          Plant {plant} of {PLANT_COUNT}
        </span>
        <span>
          {index + 1} / {TOTAL}
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--border)]">
        <div className="h-full rounded-full bg-[var(--accent)] transition-all" style={{ width: `${(index / TOTAL) * 100}%` }} />
      </div>

      <div className="card flex flex-col items-center gap-6 p-10 text-center">
        <div className="text-xl font-medium">{position} leaf</div>
        <div className="grid w-full grid-cols-2 gap-3">
          {LEVELS.map((level) => (
            <button
              key={level.value}
              onClick={() => record(level.value)}
              className="rounded-xl py-6 text-lg font-medium text-white shadow-sm transition-transform active:scale-95"
              style={{ background: level.color }}
            >
              {level.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
