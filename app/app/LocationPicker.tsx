"use client";

import { useState } from "react";
import { BAYS, bayLabel, CANVAS_H, CANVAS_W, nearestBay, type Bay } from "@/lib/floorplan-bays";

// The single location-picking component every creation flow uses now
// (pest/disease events, traps, treatments, scouting): "fill the form
// first, then pick site + area + bay on one swipeable map screen,"
// replacing the old site-list -> area-list -> form -> single-facility-map
// order. Every
// facility/area still shares the one generic BAYS grid (see
// lib/floorplan-bays.ts) -- swiping changes which facility/area you're
// placing into, not the visual layout, until real per-facility floor plans
// exist.
const VIEW_W = 296;
const VIEW_H = 400;
const BENCH_W = 86;
const BENCH_H = 9;

function toView(bay: Bay) {
  return { cx: (bay.x / CANVAS_W) * VIEW_W, cy: (bay.y / CANVAS_H) * VIEW_H };
}

export interface PickerArea {
  id: string;
  name: string;
}

export interface PickerFacility {
  id: string;
  name: string;
  areas: PickerArea[];
}

export default function LocationPicker({
  facilities,
  onConfirm,
  onCancel,
  initialFacilityId,
  initialAreaId,
  initialX,
  initialY,
}: {
  facilities: PickerFacility[];
  onConfirm: (facilityId: string, areaId: string, x: number, y: number) => void;
  onCancel: () => void;
  // Lets an entry point that already knows the site/area (a trap-spike
  // alert's "confirm this pest event?" deep link, e.g.) skip straight past
  // the swipe step instead of always starting at facilities[0] -- still
  // just a starting point, not a lock: the picker is fully swipeable/
  // reassignable from there same as any other visit.
  initialFacilityId?: string;
  initialAreaId?: string;
  // A dropped pin carried over from a scouting handoff (lib/scouting-
  // alerts.ts) -- pre-selects the nearest bay instead of leaving "no
  // location selected," same "starting point, not a lock" rule as above.
  initialX?: number;
  initialY?: number;
}) {
  const initialIdx = initialFacilityId ? facilities.findIndex((f) => f.id === initialFacilityId) : -1;
  const [facilityIdx, setFacilityIdx] = useState(initialIdx >= 0 ? initialIdx : 0);
  const [areaId, setAreaId] = useState<string | null>(
    (initialIdx >= 0 && initialAreaId) || facilities[initialIdx >= 0 ? initialIdx : 0]?.areas[0]?.id || null
  );
  const [selected, setSelected] = useState<Bay | null>(
    initialX != null && initialY != null ? nearestBay(initialX, initialY) : null
  );
  const [confirming, setConfirming] = useState(false);
  const [touchStartX, setTouchStartX] = useState<number | null>(null);

  const facility = facilities[facilityIdx];
  const areas = facility?.areas ?? [];
  const currentAreaId = areaId && areas.some((a) => a.id === areaId) ? areaId : (areas[0]?.id ?? null);

  function goTo(idx: number) {
    const next = ((idx % facilities.length) + facilities.length) % facilities.length;
    setFacilityIdx(next);
    setAreaId(facilities[next]?.areas[0]?.id ?? null);
    setSelected(null);
  }

  function onTouchStart(e: React.TouchEvent) {
    setTouchStartX(e.touches[0].clientX);
  }
  function onTouchEnd(e: React.TouchEvent) {
    if (touchStartX == null) return;
    const dx = e.changedTouches[0].clientX - touchStartX;
    if (Math.abs(dx) > 50) goTo(facilityIdx + (dx < 0 ? 1 : -1));
    setTouchStartX(null);
  }

  function confirm() {
    if (!selected || !currentAreaId || !facility || confirming) return;
    setConfirming(true);
    onConfirm(facility.id, currentAreaId, selected.x, selected.y);
  }

  const selectedView = selected ? toView(selected) : null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background: "var(--surface)" }}>
      <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4">
        <button onClick={onCancel} className="text-sm text-[var(--text-dim)]">
          Cancel
        </button>
        <span className="text-sm font-medium">Place location</span>
        <span className="w-9" />
      </div>

      <div className="flex items-center justify-between gap-2 border-b border-[var(--border)] px-3 py-3">
        <button
          onClick={() => goTo(facilityIdx - 1)}
          disabled={facilities.length < 2}
          className="px-2 text-[var(--text-dim)] disabled:opacity-30"
        >
          &#8249;
        </button>
        <div className="flex flex-col items-center">
          <span className="text-sm font-medium">{facility?.name ?? "No sites"}</span>
          {facilities.length > 1 && (
            <div className="mt-1 flex gap-1">
              {facilities.map((f, i) => (
                <span
                  key={f.id}
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ background: i === facilityIdx ? "var(--accent)" : "var(--border-soft)" }}
                />
              ))}
            </div>
          )}
        </div>
        <button
          onClick={() => goTo(facilityIdx + 1)}
          disabled={facilities.length < 2}
          className="px-2 text-[var(--text-dim)] disabled:opacity-30"
        >
          &#8250;
        </button>
      </div>

      {areas.length > 1 && (
        <div className="flex gap-2 overflow-x-auto border-b border-[var(--border)] px-4 py-2.5">
          {areas.map((a) => (
            <button
              key={a.id}
              onClick={() => {
                setAreaId(a.id);
                setSelected(null);
              }}
              className={`shrink-0 rounded-full border px-3 py-1 text-xs ${
                currentAreaId === a.id ? "border-[var(--accent)] text-[var(--accent)]" : "border-[var(--border)] text-[var(--text-dim)]"
              }`}
            >
              {a.name}
            </button>
          ))}
        </div>
      )}

      {areas.length === 0 ? (
        <div className="flex flex-1 items-center justify-center px-8 text-center text-sm text-[var(--text-dim)]">
          {facility ? `${facility.name} has no areas yet.` : "You have no sites yet."}
        </div>
      ) : (
        <>
          <div className="flex items-center gap-2 border-b border-[var(--border)] px-5 py-3">
            <span className="text-[var(--text-faint)]">&#9757;</span>
            <span className="text-xs text-[var(--text-dim)]">Swipe to change site &middot; tap a bench to place</span>
          </div>

          <div
            className="flex-1 overflow-hidden"
            style={{ background: "#0a1120" }}
            onTouchStart={onTouchStart}
            onTouchEnd={onTouchEnd}
          >
            <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} preserveAspectRatio="xMidYMid meet" className="block h-full w-full">
              <rect x="38" y="20" width="220" height="360" rx="3" fill="none" stroke="#1e2c46" strokeWidth="1" />
              <line x1="148" y1="24" x2="148" y2="376" stroke="#111c2d" strokeWidth="0.75" strokeDasharray="1 5" />
              {BAYS.map((b) => {
                const { cx, cy } = toView(b);
                const isSelected = selected?.row === b.row && selected?.index === b.index;
                return (
                  <rect
                    key={`${b.row}${b.index}`}
                    x={cx - BENCH_W / 2}
                    y={cy - BENCH_H / 2}
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
              {selectedView && (
                <>
                  <circle cx={selectedView.cx} cy={selectedView.cy} r={16} fill="none" stroke="var(--accent)" strokeWidth={1} opacity={0.5} />
                  <circle cx={selectedView.cx} cy={selectedView.cy - 18} r={7} fill="var(--accent)" />
                  <path
                    d={`M${selectedView.cx} ${selectedView.cy - 11} L${selectedView.cx - 5} ${selectedView.cy} L${selectedView.cx + 5} ${selectedView.cy} Z`}
                    fill="var(--accent)"
                  />
                </>
              )}
            </svg>
          </div>
        </>
      )}

      <div className="border-t border-[var(--border)] px-5 pb-6 pt-4">
        <div className="mb-3 flex items-center gap-2">
          <span style={{ color: "var(--accent)" }}>&#128205;</span>
          <div>
            <div className="text-sm">{selected ? bayLabel(selected) : "No location selected"}</div>
            <div className="label-mono">
              {facility?.name.toUpperCase() ?? ""}
              {areas.find((a) => a.id === currentAreaId) ? ` · ${areas.find((a) => a.id === currentAreaId)!.name.toUpperCase()}` : ""}
            </div>
          </div>
        </div>
        <button
          onClick={confirm}
          disabled={!selected || !currentAreaId || confirming}
          className="btn-location w-full rounded-xl py-3.5 text-sm font-medium disabled:opacity-40"
        >
          {confirming ? "Setting…" : "Set location"}
        </button>
      </div>
    </div>
  );
}
