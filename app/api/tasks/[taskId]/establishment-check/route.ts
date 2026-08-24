import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { establishmentChecks, tasks } from "@/db/schema";
import { requireGrowerSession } from "@/lib/session";

// Records the real outcome (not just "task done") and completes the task
// in one action -- the whole point of this task type is the yes/no
// answer, not a generic "logged minutes" completion.
export async function POST(request: NextRequest, { params }: { params: Promise<{ taskId: string }> }) {
  const session = await requireGrowerSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { taskId } = await params;
  const [task] = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.id, taskId), eq(tasks.organizationId, session.organizationId!)));
  if (!task || task.type !== "establishment_check") return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await request.json();
  if (typeof body.established !== "boolean") {
    return NextResponse.json({ error: "established (true/false) is required" }, { status: 400 });
  }
  const notes = typeof body.notes === "string" && body.notes.trim() ? body.notes.trim() : null;

  const [check] = await db
    .update(establishmentChecks)
    .set({ established: body.established, notes, checkedAt: new Date(), checkedByUserId: session.user!.id! })
    .where(eq(establishmentChecks.taskId, taskId))
    .returning();
  if (!check) return NextResponse.json({ error: "No establishment check record for this task" }, { status: 404 });

  await db
    .update(tasks)
    .set({ status: "done", completedAt: new Date(), completedByUserId: session.user!.id! })
    .where(eq(tasks.id, taskId));

  return NextResponse.json(check);
}
