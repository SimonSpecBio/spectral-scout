import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { facilityAreas, memberships, taskTypeEnum, tasks } from "@/db/schema";
import { getOwnedFacility } from "@/lib/facilities";
import { nearestBay } from "@/lib/floorplan-bays";
import { getOwnedPestEvent } from "@/lib/pest-events";
import { notifyTaskAssigned } from "@/lib/push";
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
  // The area a task's REI check runs against -- the linked event's own
  // area first (matches x/y's inheritance above), falling back to an
  // explicitly-supplied facilityAreaId for a task with no linked event.
  const taskAreaId = event?.facilityAreaId ?? facilityAreaId;

  // Matched by facilityAreaId + bayKey (both stable, non-display keys),
  // never by the bay LABEL string (ticket reclLv77FtmxbLHZr) -- a real,
  // grower-named zone label and this route's always-generic
  // bayLabel(nearestBay(...)) never matched each other, so the interlock
  // silently stopped blocking anything the moment an area got labeled
  // zones. Also no longer gated on the task having a pin at all (ticket
  // recVRucXHLYwnnWhq): a task with no pin still needs to be blocked if
  // its whole area is under REI, not silently skipped past the check --
  // missing location narrows what's known, it must never narrow what's
  // protected. A null bayKey on either side is treated as "this whole
  // area", so an unpinned task/restriction pair still collides correctly;
  // two pinned ones must match the exact bay.
  if (facilityId && taskAreaId) {
    const restrictions = await computeRestrictions(facilityId);
    const taskBayKey = x != null && y != null ? `${nearestBay(x, y).row}${nearestBay(x, y).index}` : null;
    const blocking = restrictions.find(
      (r) => r.reiActive && r.facilityAreaId === taskAreaId && (taskBayKey == null || r.bayKey == null || r.bayKey === taskBayKey)
    );
    if (blocking) {
      return NextResponse.json(
        { error: `${blocking.bay} is under an active REI restriction (${blocking.product}) -- no entry until it clears.` },
        { status: 409 }
      );
    }
  }

  // Assigning to someone else is owner-only, same restriction the PATCH
  // route already enforces for reassignment (ticket 99 -- this POST route
  // hadn't been checking it at all). Also verify the assignee is actually a
  // member of the caller's org, not just any user id -- neither route
  // checked that before.
  let assigneeUserId: string | null = null;
  if (typeof body.assigneeUserId === "string") {
    if (session.membershipRole !== "owner") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const [member] = await db
      .select()
      .from(memberships)
      .where(and(eq(memberships.userId, body.assigneeUserId), eq(memberships.organizationId, session.organizationId!)));
    if (!member) return NextResponse.json({ error: "assigneeUserId is not a member of this organization" }, { status: 400 });
    assigneeUserId = body.assigneeUserId;
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
      assigneeUserId,
      createdByUserId: session.user!.id!,
      source: "manual",
      dueAt,
      repeatEveryDays: typeof body.repeatEveryDays === "number" ? body.repeatEveryDays : null,
    })
    .returning();
  await notifyTaskAssigned(row);
  return NextResponse.json(row);
}
