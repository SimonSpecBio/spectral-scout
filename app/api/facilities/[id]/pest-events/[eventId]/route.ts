import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { pestEventStatusEnum, pestEvents, severityEnum } from "@/db/schema";
import { isDemoSession } from "@/lib/demo-account";
import { getOwnedPestEvent as ownedEvent, resolvePestEvent } from "@/lib/pest-events";
import { requireGrowerSession } from "@/lib/session";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string; eventId: string }> }) {
  const session = await requireGrowerSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, eventId } = await params;
  const event = await ownedEvent(id, eventId, session.organizationId!);
  if (!event) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json(event);
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
  // Reopening is a plain field reset -- resolving goes through the shared
  // helper below instead, since only resolving has a task side effect.
  if (body.status === "active") {
    updates.status = "active";
    updates.resolvedAt = null;
    updates.autoResolved = false;
  }

  let row = Object.keys(updates).length > 0 ? (await db.update(pestEvents).set(updates).where(eq(pestEvents.id, eventId)).returning())[0] : event;

  // Resolving goes through the shared helper (also used by maybeAutoResolve,
  // lib/threshold-engine.ts) so cancelling outstanding auto_program tasks
  // can't drift between a grower resolving manually and the system doing
  // it automatically.
  if (pestEventStatusEnum.enumValues.includes(body.status) && body.status === "resolved") {
    row = await resolvePestEvent(eventId);
  }

  return NextResponse.json(row);
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string; eventId: string }> }) {
  const session = await requireGrowerSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (isDemoSession(session)) return NextResponse.json({ error: "Deleting events is disabled on the shared demo account" }, { status: 403 });

  const { id, eventId } = await params;
  const event = await ownedEvent(id, eventId, session.organizationId!);
  if (!event) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await db.delete(pestEvents).where(eq(pestEvents.id, eventId));
  return NextResponse.json({ ok: true });
}
