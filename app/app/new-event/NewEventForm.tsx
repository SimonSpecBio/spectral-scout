"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { aggregateLeafGrid, emptyLeafGrid, type PlantLeaves } from "@/lib/density";
import { queuedFetch } from "@/lib/offline-queue";
import { markEngaged } from "@/lib/pwa-engagement";
import { findPestProgram } from "@/lib/treatments-catalog";
import { useDraftAutosave, useDraftValue } from "@/lib/use-draft";
import FormField from "../FormField";
import LocationPicker, { type PickerFacility } from "../LocationPicker";
import { cycleLeafState, PestLeafGrid } from "../PestLeafGrid";
import SpeciesPicker from "../SpeciesPicker";
import SubmitButton from "../SubmitButton";
import { MethodTabs, useSwipeableMethod } from "../SwipeableMethod";

type Severity = "low" | "moderate" | "high" | "severe";
const SEVERITIES: Severity[] = ["low", "moderate", "high", "severe"];
const DRAFT_KEY = "scout-new-event-draft";
const METHODS = ["quick", "detailed"] as const;
type Method = (typeof METHODS)[number];
const METHOD_LABELS: Record<Method, string> = { quick: "Quick", detailed: "Detailed" };

interface ScoutingHandoff {
  observationId: string;
  x: number | null;
  y: number | null;
  sampleSize: number;
  pestCount: number;
  metricKind: "occupancy" | "density";
}

// A scouting alert that gets confirmed as a new event two things: don't
// make the grower re-enter what was already observed, and don't leave the
// originating session stranded unpromoted (it would otherwise keep
// re-alerting on the same over-threshold data forever, see
// lib/scouting-alerts.ts's comment). Severity defaults from the observed
// reading using the same rough bands the severity buttons already imply,
// rather than always landing on "moderate" regardless of how bad the
// handoff data actually looked. Occupancy (a leaf-grid walk) bands on %
// infested; density (a Counts tally) bands on mean pests/leaf instead --
// same bands PestEventDetail's bandFromInfestedPct/bandFromDensity use for
// trap/scouting alerts with no event yet, so a scout sees the same number
// read the same way everywhere.
function severityFromHandoff(h: ScoutingHandoff): Severity {
  if (h.sampleSize <= 0) return "low";
  if (h.metricKind === "density") {
    const perLeaf = h.pestCount / h.sampleSize;
    if (perLeaf >= 9) return "severe";
    if (perLeaf >= 6) return "high";
    if (perLeaf >= 3) return "moderate";
    return "low";
  }
  const pct = (h.pestCount / h.sampleSize) * 100;
  if (pct >= 60) return "severe";
  if (pct >= 40) return "high";
  if (pct >= 20) return "moderate";
  return "low";
}

export default function NewEventForm({
  facilities,
  presetFacilityId,
  presetAreaId,
  presetSpecies,
  handoff,
}: {
  facilities: PickerFacility[];
  presetFacilityId?: string;
  presetAreaId?: string;
  // A catalog id handed off from the "Should I worry?" symptom-tree popup
  // (lib/symptom-tree.ts) -- prefills both the display name and the
  // scientific name, same pair SpeciesPicker fills in when a grower picks
  // a suggestion themselves.
  presetSpecies?: string;
  handoff: ScoutingHandoff | null;
}) {
  const router = useRouter();

  // Same draft-recovery pattern MonitoringFlow uses: a scouting handoff's
  // prefill only applies when there's no in-progress draft to restore
  // instead, so a saved draft always wins over stale handoff defaults.
  const draft = useDraftValue(DRAFT_KEY) as { species?: unknown; scientificName?: unknown; severity?: unknown; notes?: unknown } | null;

  const presetProgram = !draft?.species && presetSpecies ? findPestProgram(presetSpecies) : undefined;
  const [species, setSpecies] = useState(
    typeof draft?.species === "string" ? draft.species : (presetProgram?.commonName ?? "")
  );
  const [scientificName, setScientificName] = useState<string | null>(
    typeof draft?.scientificName === "string" ? draft.scientificName : (presetProgram?.latin ?? null)
  );
  const [severity, setSeverity] = useState<Severity>(
    typeof draft?.severity === "string" && SEVERITIES.includes(draft.severity as Severity)
      ? (draft.severity as Severity)
      : handoff
        ? severityFromHandoff(handoff)
        : "moderate"
  );
  const [notes, setNotes] = useState(
    typeof draft?.notes === "string"
      ? draft.notes
      : handoff
        ? handoff.metricKind === "density"
          ? `Scouting handoff: ${handoff.pestCount} pests across ${handoff.sampleSize} leaves checked, over threshold.`
          : `Scouting handoff: ${handoff.pestCount}/${handoff.sampleSize} checked over threshold.`
        : ""
  );
  const [submitting, setSubmitting] = useState(false);
  const [placingLocation, setPlacingLocation] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // "Quick" (severity buttons, the existing default -- Simon, live
  // feedback, 2026-09-07: "good as default") vs. "Detailed" (the same
  // 10-plant leaf-check grid MonitoringFlow uses for ongoing scouting),
  // swipeable between the two same as LocationPicker's facility swipe.
  const { method, setMethod, onTouchStart, onTouchEnd } = useSwipeableMethod<Method>(METHODS, "quick");
  const [grid, setGrid] = useState<PlantLeaves[]>(emptyLeafGrid());
  const [lastLeafChange, setLastLeafChange] = useState<{ p: number; l: number; prevState: PlantLeaves[number] } | null>(null);
  const leafAgg = aggregateLeafGrid(grid);

  function toggleLeaf(p: number, l: number) {
    setLastLeafChange({ p, l, prevState: grid[p][l] });
    setGrid((prev) => {
      const next = prev.map((row) => [...row]) as PlantLeaves[];
      next[p][l] = cycleLeafState(next[p][l]);
      return next;
    });
  }
  function undoLastLeafChange() {
    if (!lastLeafChange) return;
    const { p, l, prevState } = lastLeafChange;
    setGrid((prev) => {
      const next = prev.map((row) => [...row]) as PlantLeaves[];
      next[p][l] = prevState;
      return next;
    });
    setLastLeafChange(null);
  }

  const clearDraft = useDraftAutosave(DRAFT_KEY, { species, scientificName, severity, notes });

  async function handleConfirmLocation(facilityId: string, areaId: string, x: number, y: number) {
    setSubmitting(true);
    setError(null);
    const result = await queuedFetch(
      `/api/facilities/${facilityId}/pest-events`,
      {
        facilityAreaId: areaId,
        pestSpecies: species,
        scientificName,
        severity,
        notes,
        x,
        y,
        sourceObservationId: handoff?.observationId ?? null,
        // Detailed method's leaf-check grid rides along as this event's
        // first monitoring session, same pattern as the disease event
        // form's leaf-severity grid (initialMonitoring, created atomically
        // with the event server-side).
        initialMonitoring: method === "detailed" && leafAgg.leavesChecked > 0
          ? { sampleSize: leafAgg.leavesChecked, pestCount: leafAgg.leavesInfested, assessmentType: "pest_count", leafGrid: grid }
          : undefined,
      },
      "Pest event"
    );
    if (result.ok) {
      markEngaged();
      clearDraft();
      // Queued (offline): no server-generated id exists yet to link to a
      // detail page, so land on the facility instead of the usual
      // pest-events/[id] route -- same reasoning as CountsFlow/
      // MonitoringFlow landing on a fixed route rather than one derived
      // from this response.
      if (result.queued) {
        router.push(`/app/facilities/${facilityId}`);
      } else {
        const row = result.data as { id: string };
        router.push(`/app/facilities/${facilityId}/pest-events/${row.id}`);
      }
    } else {
      setSubmitting(false);
      setPlacingLocation(false);
      setError("Couldn't save this event. Check your connection and try again.");
    }
  }

  if (placingLocation) {
    return (
      <LocationPicker
        facilities={facilities}
        initialFacilityId={presetFacilityId}
        initialAreaId={presetAreaId}
        initialX={handoff?.x ?? undefined}
        initialY={handoff?.y ?? undefined}
        onConfirm={handleConfirmLocation}
        onCancel={() => setPlacingLocation(false)}
        step={{ current: 2, total: 2 }}
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-end">
        <button type="button" onClick={() => router.back()} className="text-sm text-[var(--text-dim)]">
          Cancel
        </button>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setPlacingLocation(true);
        }}
        className="card flex flex-col gap-3 p-4 pb-24"
      >
        <SpeciesPicker
          kind="pest"
          value={species}
          onChange={(name, latin) => {
            setSpecies(name);
            setScientificName(latin);
          }}
          placeholder="Pest species (e.g. spider mites)"
          autoFocus
        />
        <MethodTabs methods={METHODS} labels={METHOD_LABELS} method={method} onSelect={setMethod} />
        <div className="flex flex-col gap-3" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
          <div className="flex gap-2">
            {SEVERITIES.map((s) => (
              <button
                type="button"
                key={s}
                onClick={() => setSeverity(s)}
                className={`flex-1 rounded-md border px-3 py-2 text-sm capitalize ${
                  severity === s ? "border-[var(--accent-text)] text-[var(--accent-text)]" : "border-[var(--border)] text-[var(--text-dim)]"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
          {method === "detailed" && (
            <div className="flex flex-col gap-2">
              <p className="text-xs text-[var(--text-dim)]">
                Pick 10 plants at random. On each, check a top, middle, and bottom leaf. Tap a leaf to record it; tap
                again to change it.
              </p>
              <PestLeafGrid grid={grid} onToggle={toggleLeaf} />
              {lastLeafChange && (
                <button
                  type="button"
                  onClick={undoLastLeafChange}
                  className="min-h-11 self-start rounded-md border border-[var(--border)] px-3 text-xs text-[var(--text-dim)]"
                >
                  Undo last tap
                </button>
              )}
              {leafAgg.leavesChecked > 0 && (
                <div className="flex gap-6">
                  <div>
                    <div className="text-lg font-semibold">{leafAgg.infestedPct}%</div>
                    <div className="text-xs text-[var(--text-dim)]">
                      Infested ({leafAgg.leavesInfested}/{leafAgg.leavesChecked})
                    </div>
                  </div>
                  <div>
                    <div className="text-lg font-semibold">{leafAgg.estDensity}</div>
                    <div className="text-xs text-[var(--text-dim)]">Estimated density</div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
        <FormField label="Notes (optional)">
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Notes (optional)"
            className="rounded-md border border-[var(--border)] bg-transparent px-3 py-2 text-sm"
          />
        </FormField>
        {error && (
          <div
            className="flex items-center justify-between gap-3 rounded-md p-3.5 text-sm"
            style={{ background: "var(--danger-bg)", color: "var(--danger)" }}
          >
            {error}
            <button type="button" onClick={() => setError(null)} className="shrink-0 text-[var(--text-dim)]">
              Dismiss
            </button>
          </div>
        )}
        <SubmitButton disabled={submitting || !species.trim() || facilities.length === 0} variant="floating">
          {submitting ? "Logging…" : "Select location"}
        </SubmitButton>
        <div className="text-center text-xs text-[var(--text-dim)]">Draft saves automatically as you go.</div>
      </form>
    </div>
  );
}
