import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { pestEventStatusEnum, pestEvents, severityEnum } from "@/db/schema";
import { getOwnedFacility } from "@/lib/facilities";
import { requireGrowerSession } from "@/lib/session";

async function ownedEvent(facilityId: string, eventId: string, organizationId: string) {
  const facility = await getOwnedFacility(facilityId, organizationId);
  if (!facility) return null;
  const [event] = await db
    .select()
    .from(pestEvents)
    .where(and(eq(pestEvents.id, eventId), eq(pestEvents.facilityId, facilityId)));
  return event ?? null;
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string; eventId: string }> }) {
  const session = await requireGrowerSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, eventId } = await params;
  const event = await ownedEvent(id, eventId, session.organizationId!);
  if (!event) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await request.json();
  const updates: Partial<typeof pestEvents.$inferInsert> = {};
  if (severityEnum.enumValues.includes(body.severity)) updates.severity = body.severity;
  if (typeof body.notes === "string") updates.notes = body.notes || null;
  if (pestEventStatusEnum.enumValues.includes(body.status)) {
    updates.status = body.status;
    updates.resolvedAt = body.status === "resolved" ? new Date() : null;
  }

  const [row] = await db.update(pestEvents).set(updates).where(eq(pestEvents.id, eventId)).returning();
  return NextResponse.json(row);
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string; eventId: string }> }) {
  const session = await requireGrowerSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, eventId } = await params;
  const event = await ownedEvent(id, eventId, session.organizationId!);
  if (!event) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await db.delete(pestEvents).where(eq(pestEvents.id, eventId));
  return NextResponse.json({ ok: true });
}
