import Link from "next/link";
import { getTask, taskUrgency } from "@/lib/tasks";
import { getTeam } from "@/lib/team";
import { requireGrowerSession } from "@/lib/session";
import TaskDetailClient from "./TaskDetailClient";

export const dynamic = "force-dynamic";

const URGENCY_LABEL = { overdue: "Overdue", due_soon: "Due soon", scheduled: "Scheduled", done: "Done", snoozed: "Snoozed" } as const;
const URGENCY_COLOR = { overdue: "#CE5D40", due_soon: "#C79A3A", scheduled: "#4E6280", done: "#4E9E86", snoozed: "#4E6280" } as const;

export default async function TaskDetailPage({ params }: { params: Promise<{ taskId: string }> }) {
  const session = await requireGrowerSession();
  if (!session) return null;

  const { taskId } = await params;
  const row = await getTask(session.organizationId!, taskId);
  if (!row) {
    return (
      <div className="mx-auto flex max-w-md flex-col gap-4">
        <div className="card p-6 text-sm text-[var(--text-dim)]">Task not found.</div>
      </div>
    );
  }
  const { task, facilityName, areaName, pestSpecies, pestEventStatus } = row;
  const { members } = await getTeam(session.organizationId!);
  const urgency = taskUrgency(task);

  return (
    <div className="mx-auto flex max-w-md flex-col gap-6">
      <div className="flex items-center justify-between">
        <Link href="/app/schedule" className="text-sm text-[var(--text-dim)]">
          ← Schedule
        </Link>
        {task.status === "open" && (
          <span className="label-mono rounded-full px-2.5 py-1" style={{ background: `${URGENCY_COLOR[urgency]}22`, color: URGENCY_COLOR[urgency] }}>
            {URGENCY_LABEL[urgency].toUpperCase()}
          </span>
        )}
      </div>

      <div>
        <h1 className="text-xl font-semibold">{task.title}</h1>
        <div className="label-mono">
          {[areaName ?? facilityName, task.type.replace("_", " ").toUpperCase()].filter(Boolean).join(" · ")}
        </div>
      </div>

      {task.pestEventId && pestSpecies && task.type === "monitor" && task.status === "open" && (
        <Link
          href={`/app/facilities/${task.facilityId}/pest-events/${task.pestEventId}/monitoring?taskId=${task.id}`}
          className="rounded-md bg-[var(--accent)] px-4 py-3 text-center text-sm font-medium text-[#0B1626]"
        >
          Start recheck
        </Link>
      )}

      {task.pestEventId && pestSpecies && (
        <Link
          href={`/app/facilities/${task.facilityId}/pest-events/${task.pestEventId}`}
          className="card flex items-center justify-between p-4"
        >
          <div>
            <div className="text-sm">View {pestSpecies} event</div>
            <div className="label-mono">{(pestEventStatus ?? "").toUpperCase()}</div>
          </div>
          <span className="text-[var(--text-faint)]">›</span>
        </Link>
      )}

      <div className="card flex flex-col divide-y divide-[var(--border)]">
        <div className="flex items-center justify-between p-3.5 text-sm">
          <span className="label-mono">Due</span>
          <span>{task.dueAt.toLocaleString()}</span>
        </div>
        <div className="flex items-center justify-between p-3.5 text-sm">
          <span className="label-mono">Source</span>
          <span className="capitalize text-[var(--text-dim)]">{task.source.replace("_", " ")}</span>
        </div>
        {task.repeatEveryDays && (
          <div className="flex items-center justify-between p-3.5 text-sm">
            <span className="label-mono">Repeats</span>
            <span>Every {task.repeatEveryDays} days</span>
          </div>
        )}
      </div>

      <TaskDetailClient
        taskId={task.id}
        status={task.status}
        assigneeUserId={task.assigneeUserId}
        isOwner={session.membershipRole === "owner"}
        members={members.map((m) => ({ userId: m.userId, name: m.name, email: m.email }))}
      />
    </div>
  );
}
