import { eq } from "drizzle-orm";
import { del } from "@vercel/blob";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { observationPhotos, pestEventComments, pestEventDeletions, pestEventStatusEnum, pestEvents, severityEnum } from "@/db/schema";
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

// Deleting a pest event used to just remove the row and let foreign keys
// take their default course: pestEventComments cascades (a whole discussion
// thread about how an outbreak was handled disappears), and
// observationPhotos.pestEventId sets to null instead of cascading, leaving
// rows with both foreign keys null -- invisible in every UI, unreachable,
// and their underlying Vercel Blob objects never deleted, so storage grows
// permanently with files nobody can see or bill against. There was also no
// record anywhere that a grower-side delete ever happened at all (Airtable
// ticket recyEgh3n4vqZTqmw).
//
// Kept as a real hard delete rather than converting to soft-delete: the
// acceptance criteria this ticket set for itself accepts either recoverable
// OR recorded, and a genuine soft-delete would mean auditing and filtering
// every one of the ~20 places that read from pestEvents across the app
// (dashboard, map, logs, threshold engine, timeline, search, exports...) --
// a much larger, higher-regression-risk change than this ticket asked for.
// Instead: the actual harm (orphaned, unbillable, permanently-invisible
// blob storage) is fixed for real by deleting photo rows and their blob
// objects explicitly before the event goes, and a deletion audit row
// records that this happened, satisfying "recorded somewhere." The comment
// thread still cascades away for real -- the client-side confirm() warns
// about that up front instead, per the ticket's own "or the delete
// confirmation says exactly what will be lost."
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string; eventId: string }> }) {
  const session = await requireGrowerSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (isDemoSession(session)) return NextResponse.json({ error: "Deleting events is disabled on the shared demo account" }, { status: 403 });

  const { id, eventId } = await params;
  const event = await ownedEvent(id, eventId, session.organizationId!);
  if (!event) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [photos, comments] = await Promise.all([
    db.select().from(observationPhotos).where(eq(observationPhotos.pestEventId, eventId)),
    db.select({ id: pestEventComments.id }).from(pestEventComments).where(eq(pestEventComments.pestEventId, eventId)),
  ]);

  // Best-effort against the external blob store: a blob that fails to
  // delete just becomes a small amount of unreferenced storage, not a
  // reason to abort the whole delete and leave the event stuck. The row
  // itself is deleted regardless either way.
  if (photos.length > 0) {
    await del(photos.map((p) => p.blobUrl)).catch(() => {});
    await db.delete(observationPhotos).where(eq(observationPhotos.pestEventId, eventId));
  }

  await db.insert(pestEventDeletions).values({
    organizationId: session.organizationId!,
    pestEventId: event.id,
    pestSpecies: event.pestSpecies,
    facilityId: event.facilityId,
    facilityAreaId: event.facilityAreaId,
    deletedByUserId: session.user!.id!,
    commentCount: comments.length,
    photoCount: photos.length,
  });

  // pestEventComments cascades from here automatically.
  await db.delete(pestEvents).where(eq(pestEvents.id, eventId));
  return NextResponse.json({ ok: true });
}
