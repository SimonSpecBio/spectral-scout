"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { queuedFetch } from "@/lib/offline-queue";
import { markEngaged } from "@/lib/pwa-engagement";
import LocationPicker, { type PickerFacility } from "./LocationPicker";

// "Counts" capture method (ARCHITECTURE.md ยง3's convergence table: "pests
// on 5 leaves -> mean pests / leaf") -- a quick tally, deliberately not the
// full 10-plant grid Plant sampling uses. Feeds the exact same
// scoutingObservations row shape (sampleSize/pestCount) as every other
// method, just without a leafGrid: assessmentType stays "pest_count" since
// the density math (pestCount/sampleSize) means the same thing either way.
export default function CountsFlow({
  postUrl,
  facilities,
  redirectHref,
  taskId,
}: {
  // Event-scoped monitoring passes a static postUrl (the event's own
  // pin is already known, nothing to place) -- exactly one of postUrl /
  // facilities is provided depending on the caller. General scouting
  // passes facilities instead: site + area + bay all get picked via
  // LocationPicker after this form, and the post URL is built from
  // whichever facility/area the grower actually lands on.
  postUrl?: string;
  facilities?: PickerFacility[];
  redirectHref: string;
  // Set when this session is fulfilling a specific scheduled task (a
  // "Recheck X -- Bay Y" task from the recommendation engine's follow-up
  // cadence) -- logging the session also completes that task instead of
  // leaving it dangling open for the grower to separately go mark done.
  taskId?: string;
}) {
  const router = useRouter();
  const [counts, setCounts] = useState<number[]>([0, 0, 0, 0, 0]);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [placingLocation, setPlacingLocation] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const total = counts.reduce((a, b) => a + b, 0);
  const mean = total / counts.length;

  function setCount(i: number, v: number) {
    setCounts((prev) => prev.map((c, idx) => (idx === i ? Math.max(0, v) : c)));
  }

  async function submitSession(url: string, x: number | null, y: number | null) {
    setSubmitting(true);
    setError(null);
    const result = await queuedFetch(
      url,
      { sampleSize: counts.length, pestCount: total, leafGrid: null, notes: notes || null, x, y },
      "Counts"
    );
    if (result.ok) {
      markEngaged();
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
      setError("Couldn't save this session. Check your connection and try again.");
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (facilities) setPlacingLocation(true);
    else if (postUrl) submitSession(postUrl, null, null);
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
        <div className="text-sm font-medium">Counts</div>
        <p className="text-xs text-[var(--text-dim)]">Pick 5 leaves at random. Count pests on each.</p>
        <div className="flex flex-col divide-y divide-[var(--border)]">
          {counts.map((c, i) => (
            <div key={i} className="flex items-center justify-between py-2.5">
              <span className="text-sm text-[var(--text-dim)]">Leaf {i + 1}</span>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setCount(i, c - 1)}
                  className="flex h-8 w-8 items-center justify-center rounded-md border border-[var(--border)] text-[var(--text-dim)]"
                >
                  −
                </button>
                <span className="w-6 text-center text-sm tabular-nums">{c}</span>
                <button
                  type="button"
                  onClick={() => setCount(i, c + 1)}
                  className="flex h-8 w-8 items-center justify-center rounded-md border border-[var(--border)] text-[var(--text-dim)]"
                >
                  +
                </button>
              </div>
            </div>
          ))}
        </div>
        <div className="flex gap-6 pt-2">
          <div>
            <div className="text-2xl font-semibold">{total}</div>
            <div className="text-xs text-[var(--text-dim)]">Total pests</div>
          </div>
          <div>
            <div className="text-2xl font-semibold">{mean.toFixed(1)}</div>
            <div className="text-xs text-[var(--text-dim)]">Mean / leaf</div>
          </div>
        </div>
      </div>

      <div className="card flex flex-col gap-3 p-4">
        <div className="text-sm font-medium">Notes</div>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Anything unusual…"
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
        disabled={submitting || (!!facilities && facilities.length === 0)}
        className="btn-location fixed inset-x-4 bottom-24 z-40 mx-auto max-w-xs rounded-xl py-3.5 text-sm font-medium shadow-lg disabled:opacity-50 lg:bottom-6"
      >
        {submitting ? (facilities ? "Logging…" : "Submitting…") : facilities ? "Log location" : "Submit session"}
      </button>
    </form>
  );
}
