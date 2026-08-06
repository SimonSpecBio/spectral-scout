import { desc, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { scoutingObservations } from "@/db/schema";
import { parseMonitoringPayload } from "@/lib/monitoring";
import { getOwnedPestEvent } from "@/lib/pest-events";
import { requireGrowerSession } from "@/lib/session";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string; eventId: string }> }) {
  const session = await requireGrowerSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, eventId } = await params;
  const event = await getOwnedPestEvent(id, eventId, session.organizationId!);
  if (!event) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const rows = await db
    .select()
    .from(scoutingObservations)
    .where(eq(scoutingObservations.promotedPestEventId, eventId))
    .orderBy(desc(scoutingObservations.createdAt));
  return NextResponse.json(rows);
}

// One row per completed guided-monitoring session -- sampleSize/pestCount
// here are the same fields spectral-pilot's proven ReportForm density calc
// uses (density = pestCount/sampleSize), just fed by the tap-through
// protocol's aggregate instead of a single manual count. promotedPestEventId
// links straight to this event at creation (the column's original intent --
// an unlinked observation later escalated into a pest event -- still works
// for the general Scouting flow when that gets built; this is the other
// direction, created already-linked).
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string; eventId: string }> }) {
  const session = await requireGrowerSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, eventId } = await params;
  const event = await getOwnedPestEvent(id, eventId, session.organizationId!);
  if (!event) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!event.facilityAreaId) {
    return NextResponse.json({ error: "Event has no facility area to monitor" }, { status: 400 });
  }

  const parsed = parseMonitoringPayload(await request.json());
  if (!parsed) return NextResponse.json({ error: "sampleSize and pestCount are required" }, { status: 400 });

  const [row] = await db
    .insert(scoutingObservations)
    .values({
      organizationId: session.organizationId!,
      facilityAreaId: event.facilityAreaId,
      // Inherits the parent event's own pin -- the location is already
      // known, no reason to make a scout re-place it for a follow-up.
      x: event.x,
      y: event.y,
      submittedByUserId: session.user!.id!,
      date: new Date().toISOString().slice(0, 10),
      promotedPestEventId: eventId,
      ...parsed,
    })
    .returning();
  return NextResponse.json(row);
}
