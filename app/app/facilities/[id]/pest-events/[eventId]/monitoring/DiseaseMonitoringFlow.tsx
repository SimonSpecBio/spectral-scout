"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { aggregateDiseaseGrid, cycleDiseaseClass, emptyDiseaseGrid, type DiseaseClass, type DiseaseLeaves } from "@/lib/disease";
import { queuedFetch } from "@/lib/offline-queue";
import { markEngaged } from "@/lib/pwa-engagement";
import { useDraftAutosave, useDraftValue } from "@/lib/use-draft";
import { DiseaseGrid, DiseaseGridLegend } from "../../../../../DiseaseGrid";

// Pathogen-kind events skip MethodChoice entirely and land here instead of
// MonitoringFlow's pest presence/density grid (ticket C1) -- disease
// severity is assessed per-leaf on lib/disease.ts's 0-4 % leaf-area scale
// (already built and used by DiseaseEventForm at event creation; this is
// the same model wired into the ongoing-monitoring path it was missing
// from). Submits to the same event-scoped monitoring POST route as
// MonitoringFlow -- the route itself now branches on event.kind to update
// severity from this aggregate instead of running pest-threshold
// auto-resolve logic that was never meant for a disease's severity scale.
export default function DiseaseMonitoringFlow({
  postUrl,
  redirectHref,
  taskId,
}: {
  postUrl: string;
  redirectHref: string;
  taskId?: string;
}) {
  const router = useRouter();
  const draftKey = `scout-disease-monitoring-draft:${postUrl}`;

  const draft = useDraftValue(draftKey) as { grid?: unknown; notes?: unknown } | null;

  const [grid, setGrid] = useState<DiseaseLeaves[]>(() =>
    Array.isArray(draft?.grid) && draft.grid.length === 10 ? draft.grid : emptyDiseaseGrid()
  );
  const [notes, setNotes] = useState(typeof draft?.notes === "string" ? draft.notes : "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clearDraft = useDraftAutosave(draftKey, { grid, notes });

  const agg = aggregateDiseaseGrid(grid);

  // Same one-level undo as MonitoringFlow's pest grid and DiseaseEventForm's
  // identical grid, for the same reason: a mis-tap here feeds straight into
  // this event's severity and the only way back used to be tapping through
  // the rest of the 5-class cycle (Airtable ticket recfnsVgXC5RlyBiI).
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (agg.leavesAssessed === 0) return;
    setSubmitting(true);
    setError(null);
    const result = await queuedFetch(
      postUrl,
      {
        sampleSize: agg.leavesAssessed,
        pestCount: agg.leavesInfected,
        assessmentType: "disease_severity",
        leafGrid: grid,
        notes: notes || null,
        x: null,
        y: null,
      },
      "Disease monitoring session"
    );
    if (result.ok) {
      markEngaged();
      clearDraft();
      if (taskId) {
        // A bare fetch here used to swallow any failure -- offline, the
        // disease session above queued correctly but this completion call
        // was simply dropped, so the task stayed overdue forever and a
        // second scout re-walked the same bench (Airtable ticket
        // rec7LEsgfHWQ8glss).
        await queuedFetch(`/api/tasks/${taskId}/complete`, { minutesSpent: null }, "Task completion");
      }
      router.push(redirectHref);
    } else {
      setSubmitting(false);
      setError("Couldn't save this session. Check your connection and try again.");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 pb-24">
      <div className="card flex flex-col gap-3 p-4">
        <div className="text-sm font-medium">Leaf severity</div>
        <p className="text-xs text-[var(--text-dim)]">
          Pick 10 plants at random. On each, assess a bottom, middle, and top leaf for % leaf area affected. Tap a
          leaf to cycle through severity; tap past the last class to clear it.
        </p>

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

        <div className="flex gap-6 pt-2">
          <div>
            <div className="text-2xl font-semibold">{agg.incidencePct}%</div>
            <div className="text-xs text-[var(--text-dim)]">
              Incidence ({agg.leavesInfected}/{agg.leavesAssessed} assessed)
            </div>
          </div>
          <div>
            <div className="text-2xl font-semibold">{agg.meanSeverityPct}%</div>
            <div className="text-xs text-[var(--text-dim)]">Mean severity</div>
          </div>
          <div>
            <div className="text-2xl font-semibold">{agg.leavesAssessed}/30</div>
            <div className="text-xs text-[var(--text-dim)]">Leaves assessed</div>
          </div>
        </div>
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
      </div>

      {error && (
        <div className="card flex items-center justify-between gap-3 p-3.5 text-sm" style={{ background: "var(--danger-bg)", color: "var(--danger)" }}>
          {error}
          <button type="button" onClick={() => setError(null)} className="shrink-0 text-[var(--text-dim)]">
            Dismiss
          </button>
        </div>
      )}

      <button
        type="submit"
        disabled={submitting || agg.leavesAssessed === 0}
        className="btn-location fixed inset-x-4 bottom-24 z-40 mx-auto max-w-xs rounded-xl py-3.5 text-sm font-medium shadow-lg disabled:opacity-50 lg:bottom-6"
      >
        {submitting ? "Submitting…" : "Submit session"}
      </button>
      <div className="text-center text-xs text-[var(--text-dim)]">
        {agg.leavesAssessed === 0 ? "Assess at least one leaf before submitting." : "Draft saves automatically as you go."}
      </div>
    </form>
  );
}
