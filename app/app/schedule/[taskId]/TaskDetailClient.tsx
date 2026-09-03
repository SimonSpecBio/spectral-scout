"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { initialsFor } from "@/lib/avatar";

interface Member {
  userId: string;
  name: string | null;
  email: string;
}

export default function TaskDetailClient({
  taskId,
  status,
  assigneeUserId,
  isOwner,
  members,
}: {
  taskId: string;
  status: "open" | "done" | "snoozed";
  assigneeUserId: string | null;
  isOwner: boolean;
  members: Member[];
}) {
  const router = useRouter();
  const [assignee, setAssignee] = useState(assigneeUserId);
  const [picking, setPicking] = useState(false);
  const [snoozing, setSnoozing] = useState(false);

  const current = members.find((m) => m.userId === assignee);

  async function reassign(userId: string | null) {
    setPicking(false);
    const res = await fetch(`/api/tasks/${taskId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assigneeUserId: userId }),
    });
    if (res.ok) {
      setAssignee(userId);
      router.refresh();
    }
  }

  async function snooze() {
    setSnoozing(true);
    const res = await fetch(`/api/tasks/${taskId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "snoozed" }),
    });
    if (res.ok) router.refresh();
    setSnoozing(false);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="card flex flex-col gap-3 p-4">
        <div className="flex items-center justify-between">
          <span className="label-mono">Assigned to</span>
          {isOwner && (
            <button onClick={() => setPicking((v) => !v)} className="text-xs text-[var(--accent)]">
              {picking ? "Cancel" : "Reassign"}
            </button>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span
            className="flex h-9 w-9 items-center justify-center rounded-full text-xs"
            style={{ background: "var(--chip-bg)", color: "var(--text-dim)" }}
          >
            {current ? initialsFor(current.name, current.email) : "-"}
          </span>
          <span className="text-sm">{current ? (current.name ?? current.email) : "Unassigned"}</span>
        </div>
        {picking && (
          <div className="flex flex-wrap gap-2 border-t border-[var(--border)] pt-3">
            <button
              onClick={() => reassign(null)}
              className="rounded-md border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--text-dim)]"
            >
              Unassigned
            </button>
            {members.map((m) => (
              <button
                key={m.userId}
                onClick={() => reassign(m.userId)}
                className="rounded-md border border-[var(--border)] px-3 py-1.5 text-xs"
              >
                {m.name ?? m.email}
              </button>
            ))}
          </div>
        )}
      </div>

      {status === "open" && (
        <div className="flex gap-2">
          <button
            onClick={() => router.push(`/app/schedule/${taskId}/complete`)}
            className="flex-1 rounded-md bg-[var(--accent)] px-4 py-3 text-sm font-medium text-[var(--on-accent)]"
          >
            Mark done
          </button>
          <button
            onClick={snooze}
            disabled={snoozing}
            className="rounded-md border border-[var(--border)] px-4 py-3 text-sm text-[var(--text-dim)] disabled:opacity-50"
          >
            {snoozing ? "…" : "Snooze"}
          </button>
        </div>
      )}
      {status === "snoozed" && (
        <button
          onClick={() =>
            fetch(`/api/tasks/${taskId}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ status: "open" }),
            }).then(() => router.refresh())
          }
          className="rounded-md border border-[var(--border)] px-4 py-3 text-sm text-[var(--text-dim)]"
        >
          Unsnooze
        </button>
      )}
      {status === "done" && <div className="text-center text-sm text-[var(--text-dim)]">Completed.</div>}
    </div>
  );
}
