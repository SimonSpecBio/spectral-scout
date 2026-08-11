"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  aggregateDiseaseGrid,
  DISEASE_CLASS_LABELS,
  emptyDiseaseGrid,
  severityFromDiseaseAggregate,
  type DiseaseClass,
  type DiseaseLeaves,
} from "@/lib/disease";
import { markEngaged } from "@/lib/pwa-engagement";
import LocationPicker, { type PickerFacility } from "../LocationPicker";
import SpeciesPicker from "../SpeciesPicker";

const POSITIONS = ["Bot", "Mid", "Top"] as const;
// Same fills as the reference design: transparent/dashed for unassessed,
// then 4 alpha steps of the accent color for the severity classes.
const CLASS_FILL = ["#172234", "rgba(206,93,64,0.20)", "rgba(206,93,64,0.42)", "rgba(206,93,64,0.66)", "#CE5D40"];

function cycle(cell: DiseaseClass | null): DiseaseClass | null {
  if (cell === null) return 0;
  if (cell === 4) return null;
  return (cell + 1) as DiseaseClass;
}

export default function DiseaseEventForm({ facilities }: { facilities: PickerFacility[] }) {
  const router = useRouter();
  const [commonName, setCommonName] = useState("");
  const [scientificName, setScientificName] = useState("");
  const [grid, setGrid] = useState<DiseaseLeaves[]>(emptyDiseaseGrid);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [placingLocation, setPlacingLocation] = useState(false);

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
    const eventRes = await fetch(`/api/facilities/${facilityId}/pest-events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        facilityAreaId: areaId,
        kind: "pathogen",
        pestSpecies: commonName.trim(),
        scientificName: scientificName.trim() || null,
        severity: severityFromDiseaseAggregate(agg),
        notes: notes || null,
        x,
        y,
      }),
    });
    if (!eventRes.ok) {
      setSubmitting(false);
      setPlacingLocation(false);
      return;
    }
    const event = await eventRes.json();

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
    router.push(`/app/facilities/${facilityId}/pest-events/${event.id}`);
  }

  if (placingLocation) {
    return <LocationPicker facilities={facilities} onConfirm={handleConfirmLocation} onCancel={() => setPlacingLocation(false)} />;
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
        <div className="flex flex-col gap-2 rounded-xl border border-[var(--border-soft)] p-3.5" style={{ background: "#111c2e" }}>
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
                  className="h-6 rounded-md"
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
          <div className="rounded-xl p-3" style={{ background: "#111c2e" }}>
            <div className="label-mono">Incidence</div>
            <div className="font-mono text-lg font-medium" style={{ color: "var(--accent)" }}>
              {agg.incidencePct}%
            </div>
            <div className="label-mono">leaves infected</div>
          </div>
          <div className="rounded-xl p-3" style={{ background: "#111c2e" }}>
            <div className="label-mono">Mean severity</div>
            <div className="font-mono text-lg font-medium">{agg.meanSeverityPct}%</div>
            <div className="label-mono">leaf area</div>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <span className="label-mono">Notes</span>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Add a note..."
          rows={2}
          className="rounded-xl border border-[var(--border-soft)] px-3.5 py-3 text-sm outline-none placeholder:text-[var(--text-faint)]"
        />
      </div>

      <button
        onClick={() => setPlacingLocation(true)}
        disabled={submitting || !commonName.trim() || facilities.length === 0}
        className="fixed inset-x-4 bottom-24 z-40 mx-auto max-w-xs rounded-xl py-3.5 text-sm font-medium shadow-lg disabled:opacity-50 lg:bottom-6"
        style={{ background: "#25385a", border: "0.5px solid #37507a", color: "var(--text)" }}
      >
        {submitting ? "Logging…" : "Log location"}
      </button>
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
