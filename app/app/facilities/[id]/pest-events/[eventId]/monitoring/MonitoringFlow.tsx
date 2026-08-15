"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { aggregateLeafGrid, emptyLeafGrid, type LeafState, type PlantLeaves } from "@/lib/density";
import { queuedFetch } from "@/lib/offline-queue";
import { markEngaged } from "@/lib/pwa-engagement";
import LocationPicker, { type PickerFacility } from "../../../../../LocationPicker";

const POSITIONS = ["Top", "Middle", "Bottom"] as const;
const CYCLE: LeafState[] = ["unchecked", "absent", "low", "medium", "high"];
const STATE_LABEL: Record<LeafState, string> = { unchecked: "", absent: "Absent", low: "Low", medium: "Medium", high: "High" };

const DEVICE_STATUS = [
  { value: "working", label: "Working" },
  { value: "needs_attention", label: "Needs attention" },
  { value: "down", label: "Down" },
] as const;
const PLANT_HEALTH = [
  { value: "normal", label: "Normal" },
  { value: "phytotoxicity_observed", label: "Phytotoxicity observed" },
  { value: "other_concern", label: "Other concern" },
] as const;

// Ported from spectral-pilot's ReportForm -- a live-editable grid (tap any
// leaf in any order, tap again to correct a mistake) instead of the earlier
// forced-linear tap-through, plus environmental readings and a local draft
// autosave. Shared between event-scoped Monitoring (postUrl targets that
// event) and the global "+" quick action for routine, unlinked scouting
// (postUrl targets the area directly) -- same form either way.
export default function MonitoringFlow({
  postUrl,
  facilities,
  redirectHref,
  isPilotTier,
  taskId,
}: {
  // Event-scoped monitoring inherits the parent event's own pin server-side
  // (the location is already known -- see the monitoring POST route), so
  // passes a static postUrl and no facilities -- only the general/unlinked
  // flow needs to ask, via LocationPicker after this form, and its post
  // URL gets built from whichever facility/area the grower lands on.
  postUrl?: string;
  facilities?: PickerFacility[];
  redirectHref: string;
  isPilotTier: boolean;
  // Set when fulfilling a specific scheduled task (see CountsFlow's
  // comment) -- logging the session also completes that task.
  taskId?: string;
}) {
  const router = useRouter();
  const draftKey = `scout-monitoring-draft:${postUrl ?? "new-observation"}`;

  // Read any in-progress draft once, synchronously, as part of the initial
  // render (a lazy useState initializer, not an effect) -- avoids both a
  // flash of empty state before restoration and the react-hooks/set-state-
  // in-effect lint rule, which flags setState calls inside an effect body.
  const [draft] = useState(() => {
    try {
      const raw = localStorage.getItem(draftKey);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });

  const [grid, setGrid] = useState<PlantLeaves[]>(() =>
    Array.isArray(draft?.grid) && draft.grid.length === 10 ? draft.grid : emptyLeafGrid()
  );
  const [deviceStatus, setDeviceStatus] = useState<(typeof DEVICE_STATUS)[number]["value"]>(draft?.deviceStatus ?? "working");
  const [plantHealth, setPlantHealth] = useState<(typeof PLANT_HEALTH)[number]["value"]>(draft?.plantHealth ?? "normal");
  const [tempUnit, setTempUnit] = useState<"F" | "C">(draft?.tempUnit ?? "F");
  const [temp, setTemp] = useState<number | "">(typeof draft?.temp === "number" ? draft.temp : "");
  const [humidity, setHumidity] = useState<number | "">(typeof draft?.humidity === "number" ? draft.humidity : "");
  const [light, setLight] = useState<number | "">(typeof draft?.light === "number" ? draft.light : "");
  const [notes, setNotes] = useState(typeof draft?.notes === "string" ? draft.notes : "");
  const [satisfaction, setSatisfaction] = useState<number | null>(typeof draft?.satisfaction === "number" ? draft.satisfaction : null);
  const [submitting, setSubmitting] = useState(false);
  const [placingLocation, setPlacingLocation] = useState(false);

  // Autosave -- this write is a side effect on an external system
  // (localStorage), which is exactly what effects are for; no setState here.
  useEffect(() => {
    const nextDraft = { grid, deviceStatus, plantHealth, temp, tempUnit, humidity, light, notes, satisfaction };
    try {
      localStorage.setItem(draftKey, JSON.stringify(nextDraft));
    } catch {
      /* storage full or unavailable */
    }
  }, [draftKey, grid, deviceStatus, plantHealth, temp, tempUnit, humidity, light, notes, satisfaction]);

  const agg = aggregateLeafGrid(grid);

  function cycleLeaf(p: number, l: number) {
    setGrid((prev) => {
      const next = prev.map((row) => [...row]) as PlantLeaves[];
      next[p][l] = CYCLE[(CYCLE.indexOf(next[p][l]) + 1) % CYCLE.length];
      return next;
    });
  }

  function toggleUnit(u: "F" | "C") {
    if (u === tempUnit) return;
    if (typeof temp === "number") {
      setTemp(Math.round(u === "C" ? ((temp - 32) * 5) / 9 : (temp * 9) / 5 + 32));
    }
    setTempUnit(u);
  }

  async function submitSession(url: string, x: number | null, y: number | null) {
    setSubmitting(true);
    const avgTempF = temp === "" ? null : tempUnit === "F" ? temp : Math.round((temp * 9) / 5 + 32);
    const result = await queuedFetch(
      url,
      {
        sampleSize: agg.leavesChecked,
        pestCount: agg.leavesInfested,
        leafGrid: grid,
        avgTempF,
        avgHumidityPct: humidity === "" ? null : humidity,
        avgLightHrs: light === "" ? null : light,
        deviceStatus: isPilotTier ? deviceStatus : null,
        plantHealthFlag: plantHealth,
        notes: notes || null,
        satisfactionRating: isPilotTier ? satisfaction : null,
        x,
        y,
      },
      "Scouting log"
    );
    if (result.ok) {
      markEngaged();
      localStorage.removeItem(draftKey);
      if (taskId) {
        await fetch(`/api/tasks/${taskId}/complete`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ minutesSpent: null }),
        }).catch(() => {});
      }
      router.push(redirectHref);
    } else {
      setSubmitting(false);
      setPlacingLocation(false);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    // Location is optional -- skip straight to submitting if this session
    // doesn't capture one (event-scoped monitoring inherits the event's own
    // pin server-side instead).
    if (facilities) {
      setPlacingLocation(true);
    } else if (postUrl) {
      submitSession(postUrl, null, null);
    }
  }

  if (placingLocation && facilities) {
    return (
      <LocationPicker
        facilities={facilities}
        onConfirm={(facilityId, areaId, x, y) => submitSession(`/api/facilities/${facilityId}/areas/${areaId}/scouting`, x, y)}
        onCancel={() => setPlacingLocation(false)}
      />
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 pb-24">
      <div className="card flex flex-col gap-3 p-4">
        <div className="text-sm font-medium">Leaf check</div>
        <p className="text-xs text-[var(--text-dim)]">
          Pick 10 plants at random. On each, check a top, middle, and bottom leaf. Tap a leaf to record it; tap again
          to change it.
        </p>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {grid.map((leaves, p) => {
            const done = leaves.every((s) => s !== "unchecked");
            return (
              <div key={p} className="flex flex-col gap-1 rounded-lg border border-[var(--border)] p-2">
                <div className="flex items-center justify-between text-xs text-[var(--text-dim)]">
                  Plant {p + 1}
                  {done && <span className="text-[var(--accent)]">✓</span>}
                </div>
                {leaves.map((s, l) => (
                  <button
                    type="button"
                    key={l}
                    onClick={() => cycleLeaf(p, l)}
                    className="flex items-center justify-between rounded-md px-2 py-1.5 text-xs"
                    style={{
                      background:
                        s === "unchecked"
                          ? "transparent"
                          : s === "absent"
                            ? "#2a3b52"
                            : s === "low"
                              ? "#6bb77b55"
                              : s === "medium"
                                ? "#e8b84b66"
                                : "#d96b6b77",
                      border: s === "unchecked" ? "1px dashed var(--border)" : "1px solid transparent",
                    }}
                  >
                    <span className="text-[var(--text-dim)]">{POSITIONS[l]}</span>
                    <span>{STATE_LABEL[s] || "·"}</span>
                  </button>
                ))}
              </div>
            );
          })}
        </div>

        <div className="flex gap-6 pt-2">
          <div>
            <div className="text-2xl font-semibold">{agg.infestedPct}%</div>
            <div className="text-xs text-[var(--text-dim)]">
              Infested ({agg.leavesInfested}/{agg.leavesChecked} checked)
            </div>
          </div>
          <div>
            <div className="text-2xl font-semibold">{agg.estDensity}</div>
            <div className="text-xs text-[var(--text-dim)]">Estimated density</div>
          </div>
          <div>
            <div className="text-2xl font-semibold">{agg.leavesChecked}/30</div>
            <div className="text-xs text-[var(--text-dim)]">Leaves checked</div>
          </div>
        </div>
      </div>

      <div className="card flex flex-col gap-3 p-4">
        <div className="text-sm font-medium">Plant status{isPilotTier && " & device"}</div>
        {isPilotTier && (
          <label className="flex flex-col gap-1 text-sm">
            Are all units working?
            <select
              value={deviceStatus}
              onChange={(e) => setDeviceStatus(e.target.value as typeof deviceStatus)}
              className="rounded-md border border-[var(--border)] bg-transparent px-3 py-2"
            >
              {DEVICE_STATUS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="flex flex-col gap-1 text-sm">
          Plant health
          <select
            value={plantHealth}
            onChange={(e) => setPlantHealth(e.target.value as typeof plantHealth)}
            className="rounded-md border border-[var(--border)] bg-transparent px-3 py-2"
          >
            {PLANT_HEALTH.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="card flex flex-col gap-3 p-4">
        <div className="text-sm font-medium">Environment</div>
        <label className="flex flex-col gap-1 text-sm">
          Average temperature
          <div className="flex gap-2">
            <input
              type="number"
              inputMode="numeric"
              value={temp}
              onChange={(e) => setTemp(e.target.value === "" ? "" : Number(e.target.value))}
              placeholder={tempUnit === "F" ? "73" : "23"}
              className="flex-1 rounded-md border border-[var(--border)] bg-transparent px-3 py-2"
            />
            <div className="flex overflow-hidden rounded-md border border-[var(--border)]">
              {(["F", "C"] as const).map((u) => (
                <button
                  type="button"
                  key={u}
                  onClick={() => toggleUnit(u)}
                  className={`px-3 text-sm ${tempUnit === u ? "bg-[var(--accent)] text-[var(--on-accent)]" : "text-[var(--text-dim)]"}`}
                >
                  °{u}
                </button>
              ))}
            </div>
          </div>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Average humidity (%)
          <input
            type="number"
            inputMode="numeric"
            value={humidity}
            onChange={(e) => setHumidity(e.target.value === "" ? "" : Number(e.target.value))}
            placeholder="61"
            className="rounded-md border border-[var(--border)] bg-transparent px-3 py-2"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Average light (hours/day)
          <input
            type="number"
            inputMode="numeric"
            value={light}
            onChange={(e) => setLight(e.target.value === "" ? "" : Number(e.target.value))}
            placeholder="11"
            className="rounded-md border border-[var(--border)] bg-transparent px-3 py-2"
          />
        </label>
      </div>

      <div className="card flex flex-col gap-3 p-4">
        <div className="text-sm font-medium">Notes</div>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Anything unusual, questions, feedback…"
          rows={3}
          className="rounded-md border border-[var(--border)] bg-transparent px-3 py-2 text-sm"
        />
        {isPilotTier && (
          <label className="flex flex-col gap-2 text-sm">
            How satisfied are you with results so far?
            <div className="flex gap-2">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  type="button"
                  key={n}
                  onClick={() => setSatisfaction(n)}
                  className="flex-1 rounded-md border px-3 py-1.5 text-sm"
                  style={
                    satisfaction === n
                      ? { background: "var(--accent)", color: "var(--on-accent)", borderColor: "var(--accent)" }
                      : { borderColor: "var(--border)" }
                  }
                >
                  {n}
                </button>
              ))}
            </div>
          </label>
        )}
      </div>

      <button
        type="submit"
        disabled={submitting || (!!facilities && facilities.length === 0)}
        className="btn-location fixed inset-x-4 bottom-24 z-40 mx-auto max-w-xs rounded-xl py-3.5 text-sm font-medium shadow-lg disabled:opacity-50 lg:bottom-6"
      >
        {submitting ? (facilities ? "Logging…" : "Submitting…") : facilities ? "Log location" : "Submit session"}
      </button>
      <div className="text-center text-xs text-[var(--text-dim)]">Draft saves automatically as you go.</div>
    </form>
  );
}
