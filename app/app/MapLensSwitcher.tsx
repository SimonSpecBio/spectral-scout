"use client";

import { useState } from "react";
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

const LENSES = ["pests", "scouted", "temp", "humidity"] as const;
type Lens = (typeof LENSES)[number];
const LENS_LABEL: Record<Lens, string> = { pests: "Pests", scouted: "Last scouted", temp: "Temp", humidity: "Humid" };

// The dashboard map's lens switcher (ARCHITECTURE.md's map screen) --
// same 20-bay canvas recolored per lens, per the "one map, several views"
// rule rather than four separate maps. Pests reuses the existing
// PressureHeatmapPlaceholder as-is; the other three lenses are computed
// here from bay-keyed scouting data (lib/map-lenses.ts).
export default function MapLensSwitcher({
  events,
  bayLensEntries,
}: {
  events: { x: number; y: number; severity: Severity }[];
  bayLensEntries: BayLensEntry[];
}) {
  const [lens, setLens] = useState<Lens>("pests");

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
      <div className="flex gap-1.5 overflow-x-auto">
        {LENSES.map((l) => (
          <button
            key={l}
            onClick={() => setLens(l)}
            className={`shrink-0 rounded-full px-3 py-1.5 text-xs ${
              lens === l ? "bg-[var(--accent)] text-[#0B1626]" : "card text-[var(--text-dim)]"
            }`}
          >
            {LENS_LABEL[l]}
          </button>
        ))}
      </div>
      {lens === "pests" ? <PressureHeatmapPlaceholder events={events} /> : <BayBarMap colorByBay={colorByBay} badgeByBay={badgeByBay} />}
    </div>
  );
}
