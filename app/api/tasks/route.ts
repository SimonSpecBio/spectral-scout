import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { facilityAreas, taskTypeEnum, tasks } from "@/db/schema";
import { getOwnedFacility } from "@/lib/facilities";
import { bayLabel, nearestBay } from "@/lib/floorplan-bays";
import { getOwnedPestEvent } from "@/lib/pest-events";
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
  const rawFacilityId = typeof body.facilityId === "string" ? body.facilityId : null;
  const rawPestEventId = typeof body.pestEventId === "string" ? body.pestEventId : null;
  const rawFacilityAreaId = typeof body.facilityAreaId === "string" ? body.facilityAreaId : null;

  // Every id below is client-supplied -- verify each actually belongs to
  // the caller's org before trusting it for anything (storage, the REI
  // check, or inheriting a location from it). Same ownership pattern every
  // other nested route in this app already uses (getOwnedFacility/
  // getOwnedPestEvent); this route just hadn't been checking it.
  const facility = rawFacilityId ? await getOwnedFacility(rawFacilityId, session.organizationId!) : null;
  if (rawFacilityId && !facility) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const facilityId = facility?.id ?? null;

  const event = facilityId && rawPestEventId ? await getOwnedPestEvent(facilityId, rawPestEventId, session.organizationId!) : null;
  if (rawPestEventId && !event) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const pestEventId = event?.id ?? null;

  let facilityAreaId: string | null = null;
  if (facilityId && rawFacilityAreaId) {
    const [area] = await db
      .select()
      .from(facilityAreas)
      .where(and(eq(facilityAreas.id, rawFacilityAreaId), eq(facilityAreas.facilityId, facilityId)));
    if (!area) return NextResponse.json({ error: "Not found" }, { status: 404 });
    facilityAreaId = area.id;
  }

  // Inherits the linked event's own pin, same convention as treatments --
  // only a linked task can be bay-checked against an active REI
  // restriction (see db/schema.ts's comment on scout_task.x/y).
  const x = event?.x ?? null;
  const y = event?.y ?? null;

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
      facilityAreaId,
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
