"use client";

import { useRef, useState } from "react";
import BayBarMap from "./BayBarMap";
import PressureHeatmapPlaceholder from "./PressureHeatmapPlaceholder";

type Severity = "low" | "moderate" | "high" | "severe";

export interface BayLensEntry {
  key: string; // `${row}${index}`, matches BayBarMap's lookup
  lastScoutedAt: string | null; // ISO -- Dates aren't a valid RSC prop, serialized by the server page
  avgTempF: number | null;
  avgHumidityPct: number | null;
}

const OVERDUE_AFTER_DAYS = 7;
const DAY_MS = 86_400_000;
const SWIPE_THRESHOLD_PX = 40;

const LENSES = ["pests", "scouted", "temp", "humidity"] as const;
type Lens = (typeof LENSES)[number];
const LENS_LABEL: Record<Lens, string> = { pests: "Pests", scouted: "Last scouted", temp: "Temp", humidity: "Humidity" };

// The dashboard map's lens switcher (ARCHITECTURE.md's map screen) --
// same 20-bay canvas recolored per lens, per the "one map, several views"
// rule rather than four separate maps. Swipe left/right on the map to
// step through lenses; the dropdown below is the same control for anyone
// who'd rather jump straight to one (or is on a mouse, where swipe isn't
// natural). Pests reuses the existing PressureHeatmapPlaceholder as-is;
// the other three are computed from bay-keyed scouting data
// (lib/map-lenses.ts).
export default function MapLensSwitcher({
  events,
  bayLensEntries,
}: {
  events: { x: number; y: number; severity: Severity }[];
  bayLensEntries: BayLensEntry[];
}) {
  const [lens, setLens] = useState<Lens>("pests");
  const touchStartX = useRef<number | null>(null);

  function step(dir: 1 | -1) {
    const i = LENSES.indexOf(lens);
    setLens(LENSES[(i + dir + LENSES.length) % LENSES.length]);
  }

  function handleTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX;
  }
  function handleTouchEnd(e: React.TouchEvent) {
    if (touchStartX.current == null) return;
    const delta = e.changedTouches[0].clientX - touchStartX.current;
    touchStartX.current = null;
    if (Math.abs(delta) < SWIPE_THRESHOLD_PX) return;
    step(delta < 0 ? 1 : -1);
  }

  const colorByBay = new Map<string, string>();
  const badgeByBay = new Map<string, string>();

  if (lens === "scouted") {
    for (const e of bayLensEntries) {
      if (!e.lastScoutedAt) continue;
      const days = Math.floor((Date.now() - new Date(e.lastScoutedAt).getTime()) / DAY_MS);
      const overdue = days >= OVERDUE_AFTER_DAYS;
      colorByBay.set(e.key, overdue ? "#4a2a22" : "#223451");
      badgeByBay.set(e.key, `${days}D`);
    }
  } else if (lens === "temp") {
    for (const e of bayLensEntries) {
      if (e.avgTempF == null) continue;
      colorByBay.set(e.key, "#223451");
      badgeByBay.set(e.key, `${e.avgTempF}°F`);
    }
  } else if (lens === "humidity") {
    for (const e of bayLensEntries) {
      if (e.avgHumidityPct == null) continue;
      colorByBay.set(e.key, "#223451");
      badgeByBay.set(e.key, `${e.avgHumidityPct}%`);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
        {lens === "pests" ? <PressureHeatmapPlaceholder events={events} /> : <BayBarMap colorByBay={colorByBay} badgeByBay={badgeByBay} />}
      </div>
      <select
        value={lens}
        onChange={(e) => setLens(e.target.value as Lens)}
        className="self-center rounded-md border border-[var(--border)] bg-transparent px-3 py-1.5 text-xs text-[var(--text-dim)]"
      >
        {LENSES.map((l) => (
          <option key={l} value={l} style={{ background: "var(--surface)" }}>
            {LENS_LABEL[l]}
          </option>
        ))}
      </select>
    </div>
  );
}
