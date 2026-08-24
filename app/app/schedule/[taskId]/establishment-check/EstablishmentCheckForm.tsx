"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function EstablishmentCheckForm({
  taskId,
  agentName,
  locationLabel,
  daysSinceApplied,
  alreadyChecked,
}: {
  taskId: string;
  agentName: string;
  locationLabel: string;
  daysSinceApplied: number;
  alreadyChecked: { established: boolean; notes: string | null } | null;
}) {
  const router = useRouter();
  const [established, setEstablished] = useState<boolean | null>(alreadyChecked?.established ?? null);
  const [notes, setNotes] = useState(alreadyChecked?.notes ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(value: boolean) {
    setEstablished(value);
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/tasks/${taskId}/establishment-check`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ established: value, notes: notes.trim() || null }),
      });
      if (res.ok) {
        router.push("/app/schedule");
      } else {
        setError("Couldn't save this check. Check your connection and try again.");
      }
    } catch {
      setError("Couldn't save this check. Check your connection and try again.");
    }
    setSubmitting(false);
  }

  if (alreadyChecked) {
    return (
      <div className="card flex flex-col gap-2 p-4">
        <div className="text-sm font-medium">
          {alreadyChecked.established ? `✓ ${agentName} established` : `${agentName} did not establish`}
        </div>
        {alreadyChecked.notes && <div className="text-sm text-[var(--text-dim)]">{alreadyChecked.notes}</div>}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="card flex flex-col gap-2 p-4">
        <div className="text-sm font-medium">
          {daysSinceApplied} days ago you released <span className="capitalize">{agentName}</span> at {locationLabel}.
        </div>
        <p className="text-sm text-[var(--text-dim)]">
          Have you observed live {agentName} activity since -- on the underside of leaves, near where it was released?
        </p>
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          disabled={submitting}
          onClick={() => submit(true)}
          className={`flex-1 rounded-md px-4 py-3 text-sm font-medium disabled:opacity-50 ${
            established === true ? "bg-[var(--accent)] text-[var(--on-accent)]" : "border border-[var(--border)] text-[var(--text-dim)]"
          }`}
        >
          Yes, it&apos;s established
        </button>
        <button
          type="button"
          disabled={submitting}
          onClick={() => submit(false)}
          className={`flex-1 rounded-md px-4 py-3 text-sm font-medium disabled:opacity-50 ${
            established === false ? "bg-[var(--danger)] text-white" : "border border-[var(--border)] text-[var(--text-dim)]"
          }`}
        >
          No sign of it
        </button>
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="label-mono">Notes (optional)</span>
        <input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="e.g. humidity was low, prey already gone"
          className="rounded-md border border-[var(--border)] bg-transparent px-3 py-2 text-sm"
        />
      </label>

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
    </div>
  );
}
