import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { tasks } from "@/db/schema";
import { requireGrowerSession } from "@/lib/session";

const DAY_MS = 86_400_000;

// Completing a task logs minutes spent (labor tracking, screen 18) and, if
// it's a recurring task (repeatEveryDays set), immediately spawns the next
// open instance due that many days out -- "a recurring release task ...
// until the event resolves" (SCHEDULING.md). The completed row itself
// stays done/historical rather than getting its dueAt bumped forward, so
// the completion history is real and queryable.
export async function POST(request: NextRequest, { params }: { params: Promise<{ taskId: string }> }) {
  const session = await requireGrowerSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { taskId } = await params;
  const [task] = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.id, taskId), eq(tasks.organizationId, session.organizationId!)));
  if (!task) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await request.json();
  const minutesSpent = typeof body.minutesSpent === "number" && body.minutesSpent >= 0 ? body.minutesSpent : null;

  const [completed] = await db
    .update(tasks)
    .set({ status: "done", completedAt: new Date(), completedByUserId: session.user!.id!, minutesSpent })
    .where(eq(tasks.id, taskId))
    .returning();

  let nextTask = null;
  if (task.repeatEveryDays && task.status === "open") {
    [nextTask] = await db
      .insert(tasks)
      .values({
        organizationId: task.organizationId,
        title: task.title,
        type: task.type,
        facilityId: task.facilityId,
        facilityAreaId: task.facilityAreaId,
        pestEventId: task.pestEventId,
        assigneeUserId: task.assigneeUserId,
        createdByUserId: task.createdByUserId,
        source: task.source,
        dueAt: new Date(task.dueAt.getTime() + task.repeatEveryDays * DAY_MS),
        repeatEveryDays: task.repeatEveryDays,
      })
      .returning();
  }

  return NextResponse.json({ completed, nextTask });
}
