"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { queuedFetch } from "@/lib/offline-queue";
import { Stepper } from "../../../Stepper";
import SubmitButton from "../../../SubmitButton";

const PRESETS = [5, 15, 30, 60];

export default function CompleteTaskForm({
  taskId,
  byName,
  laborByType,
}: {
  taskId: string;
  byName: string;
  laborByType: { type: string; minutes: number }[];
}) {
  const router = useRouter();
  const [minutes, setMinutes] = useState(15);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const result = await queuedFetch(`/api/tasks/${taskId}/complete`, { minutesSpent: minutes }, "Task completion");
    if (result.ok) {
      router.push("/app/schedule");
    } else {
      setSubmitting(false);
      setError("Couldn't log this task. Check your connection and try again.");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="card flex flex-col gap-3 p-4">
        <div className="flex items-center justify-between">
          <span className="label-mono">Total application time</span>
        </div>
        <div className="flex items-center justify-center gap-3">
          <Stepper value={minutes} onChange={setMinutes} min={0} step={5} />
          <span className="label-mono">MINUTES</span>
        </div>
        <div className="flex gap-2">
          {PRESETS.map((p) => (
            <button
              type="button"
              key={p}
              onClick={() => setMinutes(p)}
              className={`flex-1 rounded-full px-3 py-1.5 text-xs ${
                minutes === p ? "bg-[var(--accent)] text-[var(--on-accent)]" : "card text-[var(--text-dim)]"
              }`}
            >
              {p < 60 ? `${p} min` : "1 hr"}
            </button>
          ))}
        </div>
      </div>

      <div className="card flex flex-col divide-y divide-[var(--border)]">
        <div className="flex items-center justify-between p-3.5 text-sm">
          <span className="label-mono">Done at</span>
          <span>Now</span>
        </div>
        <div className="flex items-center justify-between p-3.5 text-sm">
          <span className="label-mono">By</span>
          <span>{byName}</span>
        </div>
      </div>

      {laborByType.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="label-mono">Labor on this event</div>
          <div className="card flex flex-col divide-y divide-[var(--border)]">
            {laborByType.map((l) => (
              <div key={l.type} className="flex items-center justify-between p-3.5 text-sm">
                <span className="capitalize text-[var(--text-dim)]">{l.type.replace("_", " ")}</span>
                <span>
                  {l.minutes >= 60 ? `${Math.floor(l.minutes / 60)}h${l.minutes % 60 ? l.minutes % 60 : ""}` : `${l.minutes}m`}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

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
      <SubmitButton disabled={submitting}>{submitting ? "Logging…" : "Log & complete"}</SubmitButton>
    </form>
  );
}
