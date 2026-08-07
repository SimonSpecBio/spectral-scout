import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { tasks } from "@/db/schema";
import { getTask } from "@/lib/tasks";
import { requireGrowerSession } from "@/lib/session";
import CompleteTaskForm from "./CompleteTaskForm";

export const dynamic = "force-dynamic";

export default async function CompleteTaskPage({ params }: { params: Promise<{ taskId: string }> }) {
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
  const { task, pestSpecies } = row;

  // Labor comparison across this same event -- the honest "let the numbers
  // make the case" chart from SCHEDULING.md, minus the LightWare marketing
  // framing (no LightWare integration exists here yet). Only shown when
  // there's actually a linked event with other completed tasks to compare.
  let laborByType: { type: string; minutes: number }[] = [];
  if (task.pestEventId) {
    const related = await db
      .select({ type: tasks.type, minutesSpent: tasks.minutesSpent })
      .from(tasks)
      .where(and(eq(tasks.pestEventId, task.pestEventId), eq(tasks.status, "done")));
    const byType = new Map<string, number>();
    for (const r of related) {
      if (!r.minutesSpent) continue;
      byType.set(r.type, (byType.get(r.type) ?? 0) + r.minutesSpent);
    }
    laborByType = [...byType.entries()].map(([type, minutes]) => ({ type, minutes })).sort((a, b) => b.minutes - a.minutes);
  }

  return (
    <div className="mx-auto flex max-w-md flex-col gap-6">
      <h1 className="text-2xl font-semibold">Complete task</h1>
      <div>
        <div className="text-lg font-medium">{task.title}</div>
        {pestSpecies && <div className="label-mono">{pestSpecies.toUpperCase()}</div>}
      </div>
      <CompleteTaskForm taskId={task.id} byName={session.user?.name ?? session.user?.email ?? ""} laborByType={laborByType} />
    </div>
  );
}
