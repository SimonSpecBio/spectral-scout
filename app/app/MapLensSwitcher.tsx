"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import BayBarMap from "./BayBarMap";
import PressureBayMap from "./PressureBayMap";

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
const LENS_LABEL: Record<Lens, string> = { pests: "Pest pressure", scouted: "Last scouted", temp: "Temp", humidity: "Humidity" };

// The dashboard map's lens switcher (ARCHITECTURE.md's map screen) -- same
// 20-bay canvas recolored per lens, per the "one map, several views" rule
// rather than four separate maps. Pests reuses the existing PressureBayMap
// as-is; the other three are computed from bay-keyed scouting data
// (lib/map-lenses.ts).
//
// Gesture rework (ticket rec3FjL49m5aSyHPD, 2026-09-05): swiping ON this
// map used to step through lenses, which collided with a grower's instinct
// to swipe a map to pan/navigate it -- the lens is now a plain tap-to-open
// dropdown (the label + chevron below), and a swipe on the map instead
// steps between this facility's own areas, matching HomeSwipeNav's
// off-map swipe (site-to-site) as the on-map counterpart (area-to-area).
// Both stopPropagation so an on-map swipe never also fires the outer
// site-switch.
export default function MapLensSwitcher({
  facilityId,
  areas,
  currentAreaId,
  events,
  bayLensEntries,
}: {
  facilityId: string;
  areas: { id: string; name: string }[];
  currentAreaId: string | null;
  events: { id: string; facilityId: string; x: number; y: number; severity: Severity; pestSpecies: string }[];
  bayLensEntries: BayLensEntry[];
}) {
  const router = useRouter();
  const [lens, setLens] = useState<Lens>("pests");
  const touchStartX = useRef<number | null>(null);
  // BayBarMap's own two-finger pinch-to-zoom bubbles its touchstart up to
  // this same wrapper (it only listens for touchmove/touchend itself) --
  // without this guard, the lateral finger movement a pinch involves would
  // often cross SWIPE_THRESHOLD_PX and misfire an area change mid-pinch.
  const isPinch = useRef(false);

  function onTouchStart(e: React.TouchEvent) {
    e.stopPropagation();
    if (e.touches.length > 1) {
      isPinch.current = true;
      return;
    }
    isPinch.current = false;
    touchStartX.current = e.touches[0].clientX;
  }
  function onTouchEnd(e: React.TouchEvent) {
    e.stopPropagation();
    if (isPinch.current || touchStartX.current == null || areas.length < 2) {
      isPinch.current = false;
      touchStartX.current = null;
      return;
    }
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    touchStartX.current = null;
    if (Math.abs(dx) < SWIPE_THRESHOLD_PX) return;
    const idx = areas.findIndex((a) => a.id === currentAreaId);
    if (idx < 0) return;
    const dir = dx < 0 ? 1 : -1;
    const next = ((idx + dir) % areas.length + areas.length) % areas.length;
    router.push(`/app?facility=${facilityId}&area=${areas[next].id}`);
  }

  const colorByBay = new Map<string, string>();
  const badgeByBay = new Map<string, string>();

  if (lens === "scouted") {
    for (const e of bayLensEntries) {
      if (!e.lastScoutedAt) continue;
      const days = Math.floor((Date.now() - new Date(e.lastScoutedAt).getTime()) / DAY_MS);
      const overdue = days >= OVERDUE_AFTER_DAYS;
      colorByBay.set(e.key, overdue ? "var(--danger)" : "var(--map-bay-selected-fill)");
      badgeByBay.set(e.key, `${days}D`);
    }
  } else if (lens === "temp") {
    for (const e of bayLensEntries) {
      if (e.avgTempF == null) continue;
      colorByBay.set(e.key, "var(--map-bay-selected-fill)");
      badgeByBay.set(e.key, `${e.avgTempF}°F`);
    }
  } else if (lens === "humidity") {
    for (const e of bayLensEntries) {
      if (e.avgHumidityPct == null) continue;
      colorByBay.set(e.key, "var(--map-bay-selected-fill)");
      badgeByBay.set(e.key, `${e.avgHumidityPct}%`);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        {lens === "pests" ? <PressureBayMap events={events} /> : <BayBarMap colorByBay={colorByBay} badgeByBay={badgeByBay} />}
      </div>
      <div className="flex items-center justify-between px-1">
        <div className="relative inline-flex items-center gap-1">
          <select
            value={lens}
            onChange={(e) => setLens(e.target.value as Lens)}
            className="appearance-none border-0 bg-transparent p-0 text-[10px] text-[var(--text-faint)]"
          >
            {LENSES.map((l) => (
              <option key={l} value={l} style={{ background: "var(--surface)" }}>
                {LENS_LABEL[l]}
              </option>
            ))}
          </select>
          <span className="pointer-events-none text-[8px] text-[var(--text-faint)]">▾</span>
        </div>
        <Link href="/app/facilities" className="text-[10px] text-[var(--accent)]">
          + New site
        </Link>
      </div>
    </div>
  );
}
