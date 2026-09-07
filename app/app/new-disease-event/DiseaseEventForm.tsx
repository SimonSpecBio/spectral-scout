"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  aggregateDiseaseGrid,
  cycleDiseaseClass,
  emptyDiseaseGrid,
  severityFromDiseaseAggregate,
  type DiseaseClass,
  type DiseaseLeaves,
} from "@/lib/disease";
import { DiseaseGrid, DiseaseGridLegend } from "../DiseaseGrid";
import { queuedFetch } from "@/lib/offline-queue";
import { markEngaged } from "@/lib/pwa-engagement";
import { findPestProgram } from "@/lib/treatments-catalog";
import { useDraftAutosave, useDraftValue } from "@/lib/use-draft";
import FormField from "../FormField";
import LocationPicker, { type PickerFacility } from "../LocationPicker";
import SpeciesPicker from "../SpeciesPicker";
import SubmitButton from "../SubmitButton";
import { MethodTabs, useSwipeableMethod } from "../SwipeableMethod";

type Severity = "low" | "moderate" | "high" | "severe";
const SEVERITIES: Severity[] = ["low", "moderate", "high", "severe"];
const DRAFT_KEY = "scout-disease-event-draft";
const METHODS = ["quick", "detailed"] as const;
type Method = (typeof METHODS)[number];
const METHOD_LABELS: Record<Method, string> = { quick: "Quick", detailed: "Detailed" };

export default function DiseaseEventForm({
  facilities,
  presetSpecies,
}: {
  facilities: PickerFacility[];
  // A catalog id handed off from the "Should I worry?" symptom-tree popup
  // (lib/symptom-tree.ts).
  presetSpecies?: string;
}) {
  const router = useRouter();

  const draft = useDraftValue(DRAFT_KEY) as
    | { commonName?: unknown; scientificName?: unknown; grid?: unknown; notes?: unknown; severity?: unknown }
    | null;

  const presetProgram = !draft?.commonName && presetSpecies ? findPestProgram(presetSpecies) : undefined;
  const [commonName, setCommonName] = useState(
    typeof draft?.commonName === "string" ? draft.commonName : (presetProgram?.commonName ?? "")
  );
  const [scientificName, setScientificName] = useState(
    typeof draft?.scientificName === "string" ? draft.scientificName : (presetProgram?.latin ?? "")
  );
  const [grid, setGrid] = useState<DiseaseLeaves[]>(() =>
    Array.isArray(draft?.grid) && draft.grid.length === 10 ? draft.grid : emptyDiseaseGrid()
  );
  const [notes, setNotes] = useState(typeof draft?.notes === "string" ? draft.notes : "");
  const [submitting, setSubmitting] = useState(false);
  const [placingLocation, setPlacingLocation] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // "Quick" (a severity pick, same 4-button style as pest events -- Simon,
  // live feedback, 2026-09-07: pathogens should have this default too)
  // vs. "Detailed" (the existing 10-plant leaf-severity grid), swipeable
  // same as NewEventForm's pest equivalent.
  const { method, setMethod, onTouchStart, onTouchEnd } = useSwipeableMethod<Method>(METHODS, "quick");
  const [severity, setSeverity] = useState<Severity>(
    typeof draft?.severity === "string" && SEVERITIES.includes(draft.severity as Severity) ? (draft.severity as Severity) : "moderate"
  );

  const clearDraft = useDraftAutosave(DRAFT_KEY, { commonName, scientificName, grid, notes, severity });

  const agg = aggregateDiseaseGrid(grid);

  // Same one-level undo as MonitoringFlow's pest grid, and for the same
  // reason: a mis-tap here feeds straight into severityFromDiseaseAggregate
  // below, and the only way back used to be tapping through the rest of
  // the class cycle (Airtable ticket recfnsVgXC5RlyBiI).
  const [lastCellChange, setLastCellChange] = useState<{ row: number; col: number; prevCell: DiseaseClass | null } | null>(null);

  function toggleCell(row: number, col: number) {
    setLastCellChange({ row, col, prevCell: grid[row][col] });
    setGrid((prev) => {
      const next = prev.map((r) => [...r]) as DiseaseLeaves[];
      next[row][col] = cycleDiseaseClass(next[row][col]);
      return next;
    });
  }

  function undoLastCellChange() {
    if (!lastCellChange) return;
    const { row, col, prevCell } = lastCellChange;
    setGrid((prev) => {
      const next = prev.map((r) => [...r]) as DiseaseLeaves[];
      next[row][col] = prevCell;
      return next;
    });
    setLastCellChange(null);
  }

  // "Create disease event" opens the location placement screen instead of
  // submitting directly -- this is what actually finishes the submission,
  // once a real pin position exists.
  async function handleConfirmLocation(facilityId: string, areaId: string, x: number, y: number) {
    setSubmitting(true);
    setError(null);
    // The leaf-severity grid rides along in this same request (as
    // initialMonitoring) instead of a second dependent POST that would need
    // this event's server-generated id -- queuedFetch only handles
    // independent requests, so a second call would have nothing to attach
    // to if this whole submission queues offline. The API creates both rows
    // atomically when initialMonitoring is present.
    const eventResult = await queuedFetch(
      `/api/facilities/${facilityId}/pest-events`,
      {
        facilityAreaId: areaId,
        kind: "pathogen",
        pestSpecies: commonName.trim(),
        scientificName: scientificName.trim() || null,
        // Detailed method derives severity from the assessed grid, same as
        // before; Quick method uses the grower's own severity pick instead
        // since there's no grid to derive it from.
        severity: method === "detailed" ? severityFromDiseaseAggregate(agg) : severity,
        notes: notes || null,
        x,
        y,
        initialMonitoring:
          method === "detailed" && agg.leavesAssessed > 0
            ? { sampleSize: agg.leavesAssessed, pestCount: agg.leavesInfected, assessmentType: "disease_severity", leafGrid: grid }
            : undefined,
      },
      "Disease event"
    );
    if (!eventResult.ok) {
      setSubmitting(false);
      setPlacingLocation(false);
      setError("Couldn't save this disease event. Check your connection and try again.");
      return;
    }

    // Queued (offline): both rows are safely queued together for sync --
    // land on the facility instead of a not-yet-existing detail page, same
    // as NewEventForm.
    if (eventResult.queued) {
      markEngaged();
      clearDraft();
      router.push(`/app/facilities/${facilityId}`);
      return;
    }

    const event = eventResult.data as { id: string };
    markEngaged();
    localStorage.removeItem(DRAFT_KEY);
    router.push(`/app/facilities/${facilityId}/pest-events/${event.id}`);
  }

  if (placingLocation) {
    return (
      <LocationPicker
        facilities={facilities}
        onConfirm={handleConfirmLocation}
        onCancel={() => setPlacingLocation(false)}
        step={{ current: 2, total: 2 }}
      />
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-5 pb-24">
      <div className="flex items-center justify-between">
        <button onClick={() => router.back()} className="text-sm text-[var(--text-dim)]">
          Cancel
        </button>
        <span className="text-sm font-medium">New disease event</span>
        <span className="w-9" />
      </div>

      <div className="flex flex-col gap-2">
        <span className="label-mono">Species</span>
        <div className="flex flex-col gap-2 rounded-xl border border-[var(--border-soft)] p-3.5" style={{ background: "var(--surface-raised)" }}>
          <SpeciesPicker
            kind="pathogen"
            value={commonName}
            onChange={(name, latin) => {
              setCommonName(name);
              if (latin) setScientificName(latin);
            }}
            placeholder="Powdery mildew"
            bare
            autoFocus
          />
          <input
            value={scientificName}
            onChange={(e) => setScientificName(e.target.value)}
            placeholder="Scientific name (optional)"
            className="bg-transparent text-xs italic text-[var(--text-dim)] outline-none placeholder:text-[var(--text-faint)] placeholder:not-italic"
          />
        </div>
      </div>

      <MethodTabs methods={METHODS} labels={METHOD_LABELS} method={method} onSelect={setMethod} />
      <div className="flex flex-col gap-5" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        {method === "quick" ? (
          <div className="flex flex-col gap-2">
            <span className="label-mono">Severity</span>
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
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="label-mono">Leaf severity &middot; % area</span>
                <span className="label-mono" style={{ color: "var(--accent-text)" }}>
                  {agg.leavesAssessed} / 30
                </span>
              </div>
              <DiseaseGridLegend />
              <DiseaseGrid grid={grid} onToggle={toggleCell} />
              {lastCellChange && (
                <button
                  type="button"
                  onClick={undoLastCellChange}
                  className="min-h-11 self-start rounded-md border border-[var(--border-soft)] px-3 text-xs text-[var(--text-dim)]"
                >
                  Undo last tap
                </button>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <span className="label-mono">Summary</span>
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-xl p-3" style={{ background: "var(--surface-raised)" }}>
                  <div className="label-mono">Incidence</div>
                  <div className="font-mono text-lg font-medium" style={{ color: "var(--accent-text)" }}>
                    {agg.incidencePct}%
                  </div>
                  <div className="label-mono">leaves infected</div>
                </div>
                <div className="rounded-xl p-3" style={{ background: "var(--surface-raised)" }}>
                  <div className="label-mono">Mean severity</div>
                  <div className="font-mono text-lg font-medium">{agg.meanSeverityPct}%</div>
                  <div className="label-mono">leaf area</div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      <FormField label="Notes">
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Add a note..."
          rows={2}
          className="rounded-xl border border-[var(--border-soft)] px-3.5 py-3 text-sm outline-none placeholder:text-[var(--text-faint)]"
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

      <SubmitButton
        onClick={() => setPlacingLocation(true)}
        disabled={submitting || !commonName.trim() || facilities.length === 0}
        variant="floating"
      >
        {submitting ? "Logging…" : "Select location"}
      </SubmitButton>
      <div className="text-center text-xs text-[var(--text-dim)]">Draft saves automatically as you go.</div>
    </div>
  );
}
