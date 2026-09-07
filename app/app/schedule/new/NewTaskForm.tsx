"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { initialsFor } from "@/lib/avatar";
import { queuedFetch } from "@/lib/offline-queue";
import { displayNameForPestSpecies } from "@/lib/treatments-catalog";
import { useDraftAutosave, useDraftValue } from "@/lib/use-draft";
import FormField from "../../FormField";
import SubmitButton from "../../SubmitButton";

const TYPES = ["scout", "monitor", "release", "treatment", "trap_read", "sulfur", "sanitation", "test", "other"] as const;
const DRAFT_KEY = "scout-new-task-draft";

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
  const draft = useDraftValue(DRAFT_KEY) as Record<string, unknown> | null;

  const [title, setTitle] = useState(typeof draft?.title === "string" ? draft.title : "");
  const [type, setType] = useState<(typeof TYPES)[number]>(
    typeof draft?.type === "string" && TYPES.includes(draft.type as (typeof TYPES)[number]) ? (draft.type as (typeof TYPES)[number]) : "other"
  );
  const [facilityId, setFacilityId] = useState(typeof draft?.facilityId === "string" ? draft.facilityId : (facilities[0]?.id ?? ""));
  const [pestEventId, setPestEventId] = useState(typeof draft?.pestEventId === "string" ? draft.pestEventId : "");
  const [assigneeUserId, setAssigneeUserId] = useState(typeof draft?.assigneeUserId === "string" ? draft.assigneeUserId : "");
  const [dueAt, setDueAt] = useState(typeof draft?.dueAt === "string" ? draft.dueAt : localDateTimeInputDefault());
  const [repeatEveryDays, setRepeatEveryDays] = useState<number | "">(typeof draft?.repeatEveryDays === "number" ? draft.repeatEveryDays : "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clearDraft = useDraftAutosave(DRAFT_KEY, { title, type, facilityId, pestEventId, assigneeUserId, dueAt, repeatEveryDays });

  const eventsForFacility = events.filter((e) => e.facilityId === facilityId);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const result = await queuedFetch(
      "/api/tasks",
      {
        title,
        type,
        facilityId: facilityId || null,
        pestEventId: pestEventId || null,
        assigneeUserId: assigneeUserId || null,
        dueAt: new Date(dueAt).toISOString(),
        repeatEveryDays: repeatEveryDays === "" ? null : repeatEveryDays,
      },
      "New task"
    );
    if (result.ok) {
      clearDraft();
      router.push("/app/schedule");
    } else {
      setError("Couldn't assign task.");
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="card flex flex-col gap-3 p-4">
        <FormField label="Title" required>
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Release P. persimilis, Bay A1"
            required
            className="rounded-md border border-[var(--border)] bg-transparent px-3 py-2 text-sm"
          />
        </FormField>
        <FormField label="Type">
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
        </FormField>
        <FormField label="Due" required layout="row">
          <input
            type="datetime-local"
            value={dueAt}
            onChange={(e) => setDueAt(e.target.value)}
            required
            className="rounded-md border border-[var(--border)] bg-transparent px-3 py-2 text-[var(--text)]"
          />
        </FormField>
        <FormField label="Repeats every (days, optional)" layout="row">
          <input
            type="number"
            inputMode="numeric"
            min={1}
            value={repeatEveryDays}
            onChange={(e) => setRepeatEveryDays(e.target.value === "" ? "" : Number(e.target.value))}
            placeholder="7"
            className="rounded-md border border-[var(--border)] bg-transparent px-3 py-2 text-[var(--text)]"
          />
        </FormField>
      </div>

      {facilities.length > 0 && (
        <div className="card flex flex-col gap-3 p-4">
          <div className="text-sm font-medium">Location</div>
          <FormField label="Site">
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
          </FormField>
          {eventsForFacility.length > 0 && (
            <FormField label="Link to event (optional)">
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
                    {displayNameForPestSpecies(ev.pestSpecies)}
                  </option>
                ))}
              </select>
            </FormField>
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
              -
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
                  background: "var(--chip-bg)",
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

      {error && <div className="text-sm text-[var(--danger)]">{error}</div>}

      <SubmitButton disabled={submitting || !title.trim()}>{submitting ? "Assigning…" : "Assign task"}</SubmitButton>
    </form>
  );
}
