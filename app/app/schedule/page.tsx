import Link from "next/link";
import { initialsFor } from "@/lib/avatar";
import { URGENCY_COLOR } from "@/lib/colors";
import { getOrgTasks, taskUrgency } from "@/lib/tasks";
import { getTeam } from "@/lib/team";
import { requireGrowerSession } from "@/lib/session";

export const dynamic = "force-dynamic";

function dayLabel(date: Date): string {
  const now = new Date();
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffDays = Math.round((startOfDay(date).getTime() - startOfDay(now).getTime()) / 86_400_000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Tomorrow";
  if (diffDays === -1) return "Yesterday";
  return date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

// Team agenda (16_schedule.svg) -- tasks grouped by due date, filterable
// Everyone/Me/Overdue. The [+] here creates a manual task (assign flow,
// screen 17); auto-generated tasks aren't produced yet (see
// lib/inventory-catalog.ts's comment on the deferred recommendation engine).
export default async function SchedulePage({ searchParams }: { searchParams: Promise<{ who?: string }> }) {
  const session = await requireGrowerSession();
  if (!session) return null;

  const { who = "everyone" } = await searchParams;

  const rows = await getOrgTasks(session.organizationId!);
  const { members } = await getTeam(session.organizationId!);
  const memberById = new Map(members.map((m) => [m.userId, m]));

  const openRows = rows.filter((r) => r.task.status !== "done");
  const filtered = openRows.filter((r) => {
    if (who === "me") return r.task.assigneeUserId === session.user!.id;
    if (who === "overdue") return taskUrgency(r.task) === "overdue";
    return true;
  });

  const grouped = new Map<string, typeof filtered>();
  const sorted = [...filtered].sort((a, b) => a.task.dueAt.getTime() - b.task.dueAt.getTime());
  for (const row of sorted) {
    const key = dayLabel(row.task.dueAt);
    grouped.set(key, [...(grouped.get(key) ?? []), row]);
  }

  return (
    <div className="mx-auto flex max-w-md flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Schedule</h1>
        <Link href="/app/schedule/new" className="text-sm text-[var(--accent)]">
          + Assign
        </Link>
      </div>

      <div className="flex gap-2">
        {(["everyone", "me", "overdue"] as const).map((w) => (
          <Link
            key={w}
            href={`/app/schedule?who=${w}`}
            className={`rounded-full px-3 py-1.5 text-sm capitalize ${
              who === w ? "bg-[var(--accent)] text-[var(--on-accent)]" : "card text-[var(--text-dim)]"
            }`}
          >
            {w}
          </Link>
        ))}
      </div>

      {grouped.size === 0 ? (
        <div className="card p-6 text-sm text-[var(--text-dim)]">Nothing on the schedule.</div>
      ) : (
        [...grouped.entries()].map(([day, dayRows]) => (
          <div key={day} className="flex flex-col gap-2">
            <div className="label-mono">{day.toUpperCase()}</div>
            <div className="flex flex-col gap-2">
              {dayRows.map(({ task, areaName, facilityName, pestSpecies }) => {
                const urgency = taskUrgency(task);
                const assignee = task.assigneeUserId ? memberById.get(task.assigneeUserId) : null;
                return (
                  <Link
                    key={task.id}
                    href={`/app/schedule/${task.id}`}
                    className="card flex items-center gap-3 p-3.5"
                    style={{ borderLeft: `3px solid ${URGENCY_COLOR[urgency]}` }}
                  >
                    <div className="flex-1">
                      <div className="text-sm">{task.title}</div>
                      <div className="label-mono">
                        {[pestSpecies, areaName ?? facilityName].filter(Boolean).join(" · ").toUpperCase() || task.type.toUpperCase()}
                        {urgency === "overdue" && " · OVERDUE"}
                      </div>
                    </div>
                    {assignee && (
                      <span
                        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px]"
                        style={{ background: "#243449", color: "var(--text-dim)" }}
                      >
                        {initialsFor(assignee.name, assignee.email)}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
