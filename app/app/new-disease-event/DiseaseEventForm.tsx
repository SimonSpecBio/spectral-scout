"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  aggregateDiseaseGrid,
  DISEASE_CLASS_LABELS,
  emptyDiseaseGrid,
  severityFromDiseaseAggregate,
  type DiseaseClass,
  type DiseaseLeaves,
} from "@/lib/disease";
import { queuedFetch } from "@/lib/offline-queue";
import { markEngaged } from "@/lib/pwa-engagement";
import FormField from "../FormField";
import LocationPicker, { type PickerFacility } from "../LocationPicker";
import SpeciesPicker from "../SpeciesPicker";
import SubmitButton from "../SubmitButton";

const POSITIONS = ["Bot", "Mid", "Top"] as const;
// Same fills as the reference design: transparent/dashed for unassessed,
// then 4 alpha steps of the accent color for the severity classes.
const CLASS_FILL = ["var(--idle-fill)", "rgba(206,93,64,0.20)", "rgba(206,93,64,0.42)", "rgba(206,93,64,0.66)", "#CE5D40"];
const DRAFT_KEY = "scout-disease-event-draft";

function cycle(cell: DiseaseClass | null): DiseaseClass | null {
  if (cell === null) return 0;
  if (cell === 4) return null;
  return (cell + 1) as DiseaseClass;
}

export default function DiseaseEventForm({ facilities }: { facilities: PickerFacility[] }) {
  const router = useRouter();

  const [draft] = useState(() => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });

  const [commonName, setCommonName] = useState(typeof draft?.commonName === "string" ? draft.commonName : "");
  const [scientificName, setScientificName] = useState(typeof draft?.scientificName === "string" ? draft.scientificName : "");
  const [grid, setGrid] = useState<DiseaseLeaves[]>(() =>
    Array.isArray(draft?.grid) && draft.grid.length === 10 ? draft.grid : emptyDiseaseGrid()
  );
  const [notes, setNotes] = useState(typeof draft?.notes === "string" ? draft.notes : "");
  const [submitting, setSubmitting] = useState(false);
  const [placingLocation, setPlacingLocation] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ commonName, scientificName, grid, notes }));
    } catch {
      /* storage full or unavailable */
    }
  }, [commonName, scientificName, grid, notes]);

  const agg = aggregateDiseaseGrid(grid);

  function toggleCell(row: number, col: number) {
    setGrid((prev) => {
      const next = prev.map((r) => [...r]) as DiseaseLeaves[];
      next[row][col] = cycle(next[row][col]);
      return next;
    });
  }

  // "Create disease event" opens the location placement screen instead of
  // submitting directly -- this is what actually finishes the submission,
  // once a real pin position exists.
  async function handleConfirmLocation(facilityId: string, areaId: string, x: number, y: number) {
    setSubmitting(true);
    setError(null);
    const eventResult = await queuedFetch(
      `/api/facilities/${facilityId}/pest-events`,
      {
        facilityAreaId: areaId,
        kind: "pathogen",
        pestSpecies: commonName.trim(),
        scientificName: scientificName.trim() || null,
        severity: severityFromDiseaseAggregate(agg),
        notes: notes || null,
        x,
        y,
      },
      "Disease event"
    );
    if (!eventResult.ok) {
      setSubmitting(false);
      setPlacingLocation(false);
      setError("Couldn't save this disease event. Check your connection and try again.");
      return;
    }

    // Queued (offline): the event itself is safely queued for sync, but the
    // leaf-grid assessment is a second request that needs the server-
    // generated event id from the first -- there's no id yet to attach it
    // to, and this queue only handles independent POSTs, not a dependent
    // chain. The assessment grid is dropped rather than silently held
    // somewhere it can't actually be synced; land on the facility instead
    // of a not-yet-existing detail page, same as NewEventForm.
    if (eventResult.queued) {
      markEngaged();
      localStorage.removeItem(DRAFT_KEY);
      router.push(`/app/facilities/${facilityId}`);
      return;
    }

    const event = eventResult.data as { id: string };
    if (agg.leavesAssessed > 0) {
      await fetch(`/api/facilities/${facilityId}/pest-events/${event.id}/monitoring`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sampleSize: agg.leavesAssessed,
          pestCount: agg.leavesInfected,
          assessmentType: "disease_severity",
          leafGrid: grid,
        }),
      });
    }

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
    <div className="mx-auto flex max-w-md flex-col gap-5 pb-24">
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
          />
          <input
            value={scientificName}
            onChange={(e) => setScientificName(e.target.value)}
            placeholder="Scientific name (optional)"
            className="bg-transparent text-xs italic text-[var(--text-dim)] outline-none placeholder:text-[var(--text-faint)] placeholder:not-italic"
          />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="label-mono">Leaf severity &middot; % area</span>
          <span className="label-mono" style={{ color: "var(--accent)" }}>
            {agg.leavesAssessed} / 30
          </span>
        </div>
        <div className="flex flex-wrap gap-3">
          <LegendSwatch fill={CLASS_FILL[0]} border label="Unassessed" />
          {DISEASE_CLASS_LABELS.map((label, i) => (
            <LegendSwatch key={label} fill={CLASS_FILL[i]} label={label} />
          ))}
        </div>
        <div className="grid grid-cols-[26px_1fr_1fr_1fr] gap-1.5">
          <span />
          {POSITIONS.map((p) => (
            <span key={p} className="text-center text-[8px] font-mono uppercase text-[var(--text-faint)]">
              {p}
            </span>
          ))}
        </div>
        <div className="flex flex-col gap-1.5">
          {grid.map((row, r) => (
            <div key={r} className="grid grid-cols-[26px_1fr_1fr_1fr] items-center gap-1.5">
              <span className="text-[9px] font-mono text-[var(--text-faint)]">{String(r + 1).padStart(2, "0")}</span>
              {row.map((cell, c) => (
                <button
                  key={c}
                  onClick={() => toggleCell(r, c)}
                  className="h-8 rounded-md"
                  style={{
                    background: cell === null ? "transparent" : CLASS_FILL[cell],
                    border: cell === null ? "0.5px dashed var(--border-soft)" : cell === 0 ? "0.5px solid var(--border-soft)" : "0.5px solid transparent",
                  }}
                />
              ))}
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <span className="label-mono">Summary</span>
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-xl p-3" style={{ background: "var(--surface-raised)" }}>
            <div className="label-mono">Incidence</div>
            <div className="font-mono text-lg font-medium" style={{ color: "var(--accent)" }}>
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
        {submitting ? "Logging…" : "Log location"}
      </SubmitButton>
      <div className="text-center text-xs text-[var(--text-dim)]">Draft saves automatically as you go.</div>
    </div>
  );
}

function LegendSwatch({ fill, label, border }: { fill: string; label: string; border?: boolean }) {
  return (
    <span className="flex items-center gap-1.5 text-[9px] text-[var(--text-dim)]">
      <span className="h-2.5 w-2.5 rounded-sm" style={{ background: fill, border: border ? "0.5px solid var(--border-soft)" : undefined }} />
      {label}
    </span>
  );
}
