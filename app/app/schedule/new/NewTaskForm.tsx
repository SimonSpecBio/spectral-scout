"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { initialsFor } from "@/lib/avatar";

const TYPES = ["scout", "monitor", "release", "treatment", "trap_read", "sulfur", "sanitation", "test", "other"] as const;

function localDateTimeInputDefault(): string {
  const d = new Date(Date.now() + 24 * 60 * 60 * 1000); // tomorrow, a sane default due date
  d.setSeconds(0, 0);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

export default function NewTaskForm({
  facilities,
  members,
  events,
}: {
  facilities: { id: string; name: string }[];
  members: { userId: string; name: string | null; email: string; load: number }[];
  events: { id: string; pestSpecies: string; facilityId: string }[];
}) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [type, setType] = useState<(typeof TYPES)[number]>("other");
  const [facilityId, setFacilityId] = useState(facilities[0]?.id ?? "");
  const [pestEventId, setPestEventId] = useState("");
  const [assigneeUserId, setAssigneeUserId] = useState("");
  const [dueAt, setDueAt] = useState(localDateTimeInputDefault());
  const [repeatEveryDays, setRepeatEveryDays] = useState<number | "">("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const eventsForFacility = events.filter((e) => e.facilityId === facilityId);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const res = await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        type,
        facilityId: facilityId || null,
        pestEventId: pestEventId || null,
        assigneeUserId: assigneeUserId || null,
        dueAt: new Date(dueAt).toISOString(),
        repeatEveryDays: repeatEveryDays === "" ? null : repeatEveryDays,
      }),
    });
    if (res.ok) {
      router.push("/app/schedule");
    } else {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Couldn't assign task.");
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="card flex flex-col gap-3 p-4">
        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Release P. persimilis — Bay A1"
          required
          className="rounded-md border border-[var(--border)] bg-transparent px-3 py-2 text-sm"
        />
        <select
          value={type}
          onChange={(e) => setType(e.target.value as typeof type)}
          className="rounded-md border border-[var(--border)] bg-transparent px-3 py-2 text-sm capitalize"
        >
          {TYPES.map((t) => (
            <option key={t} value={t} style={{ background: "var(--surface)" }}>
              {t.replace("_", " ")}
            </option>
          ))}
        </select>
        <label className="flex flex-col gap-1 text-sm text-[var(--text-dim)]">
          Due
          <input
            type="datetime-local"
            value={dueAt}
            onChange={(e) => setDueAt(e.target.value)}
            required
            className="rounded-md border border-[var(--border)] bg-transparent px-3 py-2 text-[var(--text)]"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-[var(--text-dim)]">
          Repeats every (days, optional)
          <input
            type="number"
            inputMode="numeric"
            min={1}
            value={repeatEveryDays}
            onChange={(e) => setRepeatEveryDays(e.target.value === "" ? "" : Number(e.target.value))}
            placeholder="7"
            className="rounded-md border border-[var(--border)] bg-transparent px-3 py-2 text-[var(--text)]"
          />
        </label>
      </div>

      {facilities.length > 0 && (
        <div className="card flex flex-col gap-3 p-4">
          <div className="text-sm font-medium">Location</div>
          <select
            value={facilityId}
            onChange={(e) => {
              setFacilityId(e.target.value);
              setPestEventId("");
            }}
            className="rounded-md border border-[var(--border)] bg-transparent px-3 py-2 text-sm"
          >
            {facilities.map((f) => (
              <option key={f.id} value={f.id} style={{ background: "var(--surface)" }}>
                {f.name}
              </option>
            ))}
          </select>
          {eventsForFacility.length > 0 && (
            <select
              value={pestEventId}
              onChange={(e) => setPestEventId(e.target.value)}
              className="rounded-md border border-[var(--border)] bg-transparent px-3 py-2 text-sm"
            >
              <option value="" style={{ background: "var(--surface)" }}>
                Not linked to an event
              </option>
              {eventsForFacility.map((ev) => (
                <option key={ev.id} value={ev.id} style={{ background: "var(--surface)" }}>
                  {ev.pestSpecies}
                </option>
              ))}
            </select>
          )}
        </div>
      )}

      <div className="card flex flex-col gap-3 p-4">
        <div className="text-sm font-medium">Assign to</div>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => setAssigneeUserId("")}
            className="flex flex-col items-center gap-1"
          >
            <span
              className="flex h-9 w-9 items-center justify-center rounded-full border text-xs"
              style={{ borderColor: assigneeUserId === "" ? "var(--accent)" : "var(--border-soft)", color: "var(--text-dim)" }}
            >
              —
            </span>
            <span className="text-[10px] text-[var(--text-dim)]">Unassigned</span>
          </button>
          {members.map((m) => (
            <button
              type="button"
              key={m.userId}
              onClick={() => setAssigneeUserId(m.userId)}
              className="flex flex-col items-center gap-1"
            >
              <span
                className="flex h-9 w-9 items-center justify-center rounded-full text-xs"
                style={{
                  background: "#243449",
                  color: "var(--text-dim)",
                  border: assigneeUserId === m.userId ? "1.5px solid var(--accent)" : "1.5px solid transparent",
                }}
              >
                {initialsFor(m.name, m.email)}
              </span>
              <span className="text-[10px] text-[var(--text-dim)]">
                {(m.name ?? m.email).split(" ")[0]} · {m.load}
              </span>
            </button>
          ))}
        </div>
      </div>

      {error && <div className="text-sm text-[var(--accent)]">{error}</div>}

      <button
        type="submit"
        disabled={submitting || !title.trim()}
        className="rounded-md bg-[var(--accent)] px-4 py-3 text-sm font-medium text-[var(--on-accent)] disabled:opacity-50"
      >
        {submitting ? "Assigning…" : "Assign task"}
      </button>
    </form>
  );
}
