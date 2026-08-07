import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { taskStatusEnum, tasks } from "@/db/schema";
import { getTask } from "@/lib/tasks";
import { requireGrowerSession } from "@/lib/session";

export async function GET(_request: Request, { params }: { params: Promise<{ taskId: string }> }) {
  const session = await requireGrowerSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { taskId } = await params;
  const row = await getTask(session.organizationId!, taskId);
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(row);
}

// Reassign / snooze / edit. Reassigning to someone else is manager-only
// ("Manager can reassign", screen 17); a scout can still snooze or edit
// their own task's other fields.
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ taskId: string }> }) {
  const session = await requireGrowerSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { taskId } = await params;
  const [existing] = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.id, taskId), eq(tasks.organizationId, session.organizationId!)));
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await request.json();
  const updates: Partial<typeof tasks.$inferInsert> = {};

  if (typeof body.assigneeUserId === "string" || body.assigneeUserId === null) {
    if (session.membershipRole !== "owner") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    updates.assigneeUserId = body.assigneeUserId;
  }
  if (typeof body.status === "string") {
    if (!taskStatusEnum.enumValues.includes(body.status)) {
      return NextResponse.json({ error: "invalid status" }, { status: 400 });
    }
    updates.status = body.status;
  }
  if (typeof body.dueAt === "string") {
    const dueAt = new Date(body.dueAt);
    if (Number.isNaN(dueAt.getTime())) return NextResponse.json({ error: "invalid dueAt" }, { status: 400 });
    updates.dueAt = dueAt;
  }

  const [row] = await db.update(tasks).set(updates).where(eq(tasks.id, taskId)).returning();
  return NextResponse.json(row);
}
