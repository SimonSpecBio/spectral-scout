"use client";

import { useState } from "react";
import { SEVERITY_COLOR, type Severity } from "@/lib/colors";
import { BAYS, bayLabel, CANVAS_H, CANVAS_W, nearestBay } from "@/lib/floorplan-bays";
import { nearestZoneLabel, type Zone } from "@/lib/map-zones";

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
// The drawn bench stays thin (9 units, matching the physical layout), but a
// 9-unit-tall tap target is well under a real touch target on most phones
// once the SVG's viewBox is scaled up to the actual screen. A separate
// invisible rect handles the tap instead, sized to nearly the full 32-unit
// row pitch (lib/floorplan-bays.ts's BENCH_YS spacing) so it's as large as
// it can be without overlapping the next bay's own hit area.
const HIT_H = 30;
// How close (canvas-space) a new tap needs to land to an already-selected
// point before it's treated as "remove this one" instead of "add a new
// one" -- multi-point (allowPath) mode only. Comfortably wider than a
// single bench (BENCH_H's canvas equivalent is ~14) so a slightly-off
// second tap on the same spot still toggles it off.
const REMOVE_TOLERANCE = 40;
// Multi-point mode's cap -- an outbreak spanning more benches than this is
// the exception, not the rule, and an unbounded path would clutter both the
// picker and the confirm bar's summary.
const MAX_POINTS = 6;

function toView(pt: { x: number; y: number }) {
  return { cx: (pt.x / CANVAS_W) * VIEW_W, cy: (pt.y / CANVAS_H) * VIEW_H };
}

// Inverse of toView, for turning a tap's screen position into a canvas-space
// point -- getScreenCTM/matrixTransform accounts for however the SVG is
// actually scaled on screen (viewBox meet-scaling, device pixel ratio),
// rather than assuming a fixed pixel size the way reading offsetX/offsetY
// against hardcoded dimensions would.
function svgPointFromEvent(e: React.MouseEvent<SVGElement>): { x: number; y: number } {
  const svg = e.currentTarget.ownerSVGElement;
  if (!svg) return { x: 0, y: 0 };
  const pt = svg.createSVGPoint();
  pt.x = e.clientX;
  pt.y = e.clientY;
  const ctm = svg.getScreenCTM();
  if (!ctm) return { x: 0, y: 0 };
  const p = pt.matrixTransform(ctm.inverse());
  return { x: (p.x / VIEW_W) * CANVAS_W, y: (p.y / VIEW_H) * CANVAS_H };
}

export interface PickerArea {
  id: string;
  name: string;
  // This area's real, grower-named map zones (lib/map-zones.ts), if it's
  // ever been laid out -- empty for an area still on the generic BAYS
  // grid. Only used to resolve a REAL label for whichever generic bay slot
  // gets tapped; the tap targets themselves stay the same fixed 10-slot
  // grid regardless (see confirm bar below).
  zones?: Zone[];
  // Existing active hotspots in this area, shown as map context while
  // placing a new pin (ticket recuQ3WClsMKdcDQJ) -- purely visual, not
  // interactive, so a grower can see "there's already an outbreak two
  // benches over" instead of placing blind.
  hotspots?: { x: number; y: number; severity: Severity }[];
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
  pinRequired = true,
  allowPath = false,
}: {
  facilities: PickerFacility[];
  // extraPoints carries any points beyond the first (allowPath mode only) --
  // every existing caller's 4-arg callback still satisfies this type (extra
  // params are simply never passed to it), so this is additive, not a
  // breaking change to callers that don't care about multi-point events.
  onConfirm: (facilityId: string, areaId: string, x: number, y: number, extraPoints?: { x: number; y: number }[]) => void;
  onCancel: () => void;
  // Lets an entry point that already knows the site/area (a trap-spike
  // alert's "confirm this pest event?" deep link, e.g.) skip straight past
  // the swipe step instead of always starting at facilities[0] -- still
  // just a starting point, not a lock: the picker is fully swipeable/
  // reassignable from there same as any other visit.
  initialFacilityId?: string;
  initialAreaId?: string;
  // A dropped pin carried over from a scouting handoff (lib/scouting-
  // alerts.ts) -- pre-selects this exact point instead of leaving "no
  // location selected," same "starting point, not a lock" rule as above.
  initialX?: number;
  initialY?: number;
  // No longer rendered ("Step X of Y" wasn't useful information to the
  // grower, per direct feedback 2026-09-03) -- kept accepted-but-unused
  // rather than ripped out of every caller for a purely cosmetic removal.
  step?: { current: number; total: number };
  // Trap readings log against every trap already placed in an area, not one
  // new pin -- there's nothing to tap on the bay map for that caller, just
  // site + area. Defaults to true (every other caller places a real pin);
  // false skips the bay map/instructions entirely and enables confirm as
  // soon as an area is picked. onConfirm's x/y are meaningless in this mode
  // (passed as 0) -- the signature stays the same so every pin-placing
  // caller is unaffected.
  pinRequired?: boolean;
  // Pest/disease events only (ticket recuQ3WClsMKdcDQJ): lets a single
  // event span more than one bench/row -- tapping adds a point instead of
  // replacing it, up to MAX_POINTS, and tapping near an existing point
  // removes it. Every other caller (traps, treatments, monitoring, counts)
  // leaves this off and keeps the original single-tap-replaces behavior.
  allowPath?: boolean;
}) {
  const initialIdx = initialFacilityId ? facilities.findIndex((f) => f.id === initialFacilityId) : -1;
  const [facilityIdx, setFacilityIdx] = useState(initialIdx >= 0 ? initialIdx : 0);
  const [areaId, setAreaId] = useState<string | null>(
    (initialIdx >= 0 && initialAreaId) || facilities[initialIdx >= 0 ? initialIdx : 0]?.areas[0]?.id || null
  );
  // Order = selection order = the path an expanding outbreak is being
  // marked as following, not just a set -- points[0] is always the primary
  // location (what x/y becomes on confirm), same meaning "the selected bay"
  // had before allowPath existed.
  const [points, setPoints] = useState<{ x: number; y: number }[]>(initialX != null && initialY != null ? [{ x: initialX, y: initialY }] : []);
  const [confirming, setConfirming] = useState(false);
  const [touchStartX, setTouchStartX] = useState<number | null>(null);

  const facility = facilities[facilityIdx];
  const areas = facility?.areas ?? [];
  const currentAreaId = areaId && areas.some((a) => a.id === areaId) ? areaId : (areas[0]?.id ?? null);
  const currentArea = areas.find((a) => a.id === currentAreaId);
  const primary = points[0] ?? null;
  // The real name for whichever generic bay slot the primary point lands
  // near, when this area has ever been laid out -- falls back to the
  // generic "Bay A1" only when there's nothing real to resolve against
  // (ticket recwOKlHCcSyXb971).
  const selectedRealLabel = primary && currentArea?.zones?.length ? nearestZoneLabel(primary.x, primary.y, currentArea.zones) : null;

  function goTo(idx: number) {
    const next = ((idx % facilities.length) + facilities.length) % facilities.length;
    setFacilityIdx(next);
    setAreaId(facilities[next]?.areas[0]?.id ?? null);
    setPoints([]);
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

  function placeAt(candidate: { x: number; y: number }) {
    if (!allowPath) {
      setPoints([candidate]);
      return;
    }
    setPoints((prev) => {
      const closeIdx = prev.findIndex((p) => Math.hypot(p.x - candidate.x, p.y - candidate.y) < REMOVE_TOLERANCE);
      if (closeIdx >= 0) return prev.filter((_, i) => i !== closeIdx);
      if (prev.length >= MAX_POINTS) return prev;
      return [...prev, candidate];
    });
  }

  function onRowClick(row: "A" | "B", e: React.MouseEvent<SVGElement>) {
    const tapped = svgPointFromEvent(e);
    const rowBays = BAYS.filter((b) => b.row === row);
    const yMin = rowBays[0].y;
    const yMax = rowBays[rowBays.length - 1].y;
    const clampedY = Math.min(Math.max(tapped.y, yMin), yMax);
    placeAt({ x: rowBays[0].x, y: clampedY });
  }

  function confirm() {
    if ((pinRequired && !primary) || !currentAreaId || !facility || confirming) return;
    setConfirming(true);
    onConfirm(facility.id, currentAreaId, primary?.x ?? 0, primary?.y ?? 0, points.slice(1));
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background: "var(--surface)" }}>
      <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4">
        <button onClick={onCancel} className="text-sm text-[var(--text-dim)]">
          Cancel
        </button>
        <div className="flex flex-col items-center">
          <span className="text-sm font-medium">Place location</span>
        </div>
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
                setPoints([]);
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
      ) : !pinRequired ? (
        <div
          className="flex flex-1 items-center justify-center px-8 text-center text-sm text-[var(--text-dim)]"
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
        >
          Swipe to change site, then confirm the area below.
        </div>
      ) : (
        <>
          <div className="flex items-center gap-2 border-b border-[var(--border)] px-5 py-3">
            <span className="text-[var(--text-faint)]">&#9757;</span>
            <span className="text-xs text-[var(--text-dim)]">
              Swipe to change site &middot; tap anywhere on a row to place{allowPath ? " · tap again to add another spot" : ""}
            </span>
          </div>

          <div
            className="flex-1 overflow-hidden"
            style={{ background: "var(--map-canvas-bg)" }}
            onTouchStart={onTouchStart}
            onTouchEnd={onTouchEnd}
          >
            <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} preserveAspectRatio="xMidYMid meet" className="block h-full w-full">
              <rect x="38" y="20" width="220" height="360" rx="3" fill="none" stroke="var(--map-frame-stroke)" strokeWidth="1" />
              <line x1="148" y1="24" x2="148" y2="376" stroke="var(--map-grid-stroke)" strokeWidth="0.75" strokeDasharray="1 5" />

              {(["A", "B"] as const).map((row) => {
                const rowBays = BAYS.filter((b) => b.row === row);
                const first = toView(rowBays[0]);
                const last = toView(rowBays[rowBays.length - 1]);
                return (
                  <g key={row} onClick={(e) => onRowClick(row, e)} style={{ cursor: "pointer" }}>
                    <rect
                      x={first.cx - BENCH_W / 2}
                      y={first.cy - HIT_H / 2}
                      width={BENCH_W}
                      height={last.cy - first.cy + HIT_H}
                      fill="transparent"
                    />
                    {rowBays.map((b) => {
                      const { cx, cy } = toView(b);
                      return (
                        <rect
                          key={`${b.row}${b.index}`}
                          x={cx - BENCH_W / 2}
                          y={cy - BENCH_H / 2}
                          width={BENCH_W}
                          height={BENCH_H}
                          rx={4.5}
                          fill="var(--map-bay-fill)"
                        />
                      );
                    })}
                  </g>
                );
              })}

              <g fontFamily="ui-monospace, monospace" fontSize="8" letterSpacing="0.14em" fill="var(--map-label)">
                <text x="50" y="15">ROW A</text>
                <text x="160" y="15">ROW B</text>
              </g>

              {/* Existing hotspots -- visual context only. Drawn on top of
                  the bench rects (otherwise their opaque fill hides it
                  almost entirely) but pointer-events:none so a tap still
                  reaches the row's own click handler underneath. */}
              {currentArea?.hotspots?.map((h, i) => {
                const { cx, cy } = toView(h);
                return <circle key={i} cx={cx} cy={cy} r={5} fill={SEVERITY_COLOR[h.severity]} opacity={0.55} pointerEvents="none" />;
              })}

              {/* The path connecting multiple selected points, in selection
                  order -- only meaningful once there are 2+. */}
              {points.length > 1 && (
                <polyline
                  points={points.map((p) => { const v = toView(p); return `${v.cx},${v.cy}`; }).join(" ")}
                  fill="none"
                  stroke="var(--accent)"
                  strokeWidth={1.5}
                  strokeDasharray="3 3"
                  opacity={0.7}
                />
              )}

              {points.map((p, i) => {
                const v = toView(p);
                if (i === 0) {
                  return (
                    <g key={i}>
                      <circle cx={v.cx} cy={v.cy} r={16} fill="none" stroke="var(--accent)" strokeWidth={1} opacity={0.5} />
                      <circle cx={v.cx} cy={v.cy - 18} r={7} fill="var(--accent)" />
                      <path d={`M${v.cx} ${v.cy - 11} L${v.cx - 5} ${v.cy} L${v.cx + 5} ${v.cy} Z`} fill="var(--accent)" />
                    </g>
                  );
                }
                return (
                  <g key={i}>
                    <circle cx={v.cx} cy={v.cy} r={7} fill="var(--accent)" opacity={0.85} />
                    <text x={v.cx} y={v.cy + 2.5} fontSize="7" textAnchor="middle" fill="var(--on-accent)">
                      {i + 1}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
        </>
      )}

      <div className="border-t border-[var(--border)] px-5 pb-6 pt-4">
        <div className="mb-3 flex items-center gap-2">
          <span style={{ color: "var(--accent)" }}>&#128205;</span>
          <div>
            {pinRequired ? (
              <>
                <div className="text-sm">
                  {primary ? (selectedRealLabel ?? bayLabel(nearestBay(primary.x, primary.y))) : "No location selected"}
                  {points.length > 1 && <span className="text-[var(--text-dim)]"> +{points.length - 1} more spot{points.length > 2 ? "s" : ""}</span>}
                </div>
                <div className="label-mono">
                  {facility?.name.toUpperCase() ?? ""}
                  {areas.find((a) => a.id === currentAreaId) ? ` · ${areas.find((a) => a.id === currentAreaId)!.name.toUpperCase()}` : ""}
                </div>
              </>
            ) : (
              <>
                <div className="text-sm">{facility?.name ?? "No site selected"}</div>
                <div className="label-mono">{areas.find((a) => a.id === currentAreaId)?.name.toUpperCase() ?? ""}</div>
              </>
            )}
          </div>
        </div>
        <button
          onClick={confirm}
          disabled={(pinRequired && !primary) || !currentAreaId || confirming}
          className="btn-location w-full rounded-xl py-3.5 text-sm font-medium disabled:opacity-40"
        >
          {confirming ? "Setting…" : pinRequired ? "Set location" : "Continue"}
        </button>
      </div>
    </div>
  );
}
