import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { pestEvents, taskTypeEnum, tasks } from "@/db/schema";
import { bayLabel, nearestBay } from "@/lib/floorplan-bays";
import { computeRestrictions } from "@/lib/rei-phi";
import { requireGrowerSession } from "@/lib/session";

export async function GET() {
  const session = await requireGrowerSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rows = await db.select().from(tasks).where(eq(tasks.organizationId, session.organizationId!));
  return NextResponse.json(rows);
}

// Manual task creation (screen 17's "+" -> assign a task). source stays
// "manual" -- auto_program/auto_trigger are only ever written by
// server-side triggers, never a client POST.
export async function POST(request: NextRequest) {
  const session = await requireGrowerSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const dueAt = typeof body.dueAt === "string" ? new Date(body.dueAt) : null;
  if (!title || !dueAt || Number.isNaN(dueAt.getTime())) {
    return NextResponse.json({ error: "title and dueAt are required" }, { status: 400 });
  }
  const type = taskTypeEnum.enumValues.includes(body.type) ? body.type : "other";
  const facilityId = typeof body.facilityId === "string" ? body.facilityId : null;
  const pestEventId = typeof body.pestEventId === "string" ? body.pestEventId : null;

  // Inherits the linked event's own pin, same convention as treatments --
  // only a linked task can be bay-checked against an active REI
  // restriction (see db/schema.ts's comment on scout_task.x/y).
  let x: number | null = null;
  let y: number | null = null;
  if (pestEventId) {
    const [event] = await db.select().from(pestEvents).where(eq(pestEvents.id, pestEventId));
    if (event) {
      x = event.x;
      y = event.y;
    }
  }

  if (facilityId && x != null && y != null) {
    const restrictions = await computeRestrictions(facilityId);
    const bay = bayLabel(nearestBay(x, y));
    const blocking = restrictions.find((r) => r.bay === bay && r.reiActive);
    if (blocking) {
      return NextResponse.json(
        { error: `${bay} is under an active REI restriction (${blocking.product}) -- no entry until it clears.` },
        { status: 409 }
      );
    }
  }

  const [row] = await db
    .insert(tasks)
    .values({
      organizationId: session.organizationId!,
      title,
      type,
      facilityId,
      facilityAreaId: typeof body.facilityAreaId === "string" ? body.facilityAreaId : null,
      pestEventId,
      x,
      y,
      assigneeUserId: typeof body.assigneeUserId === "string" ? body.assigneeUserId : null,
      createdByUserId: session.user!.id!,
      source: "manual",
      dueAt,
      repeatEveryDays: typeof body.repeatEveryDays === "number" ? body.repeatEveryDays : null,
    })
    .returning();
  return NextResponse.json(row);
}
