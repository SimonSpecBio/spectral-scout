import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { treatments, treatmentTypeEnum } from "@/db/schema";
import { insertTreatmentAndDecrementStock } from "@/lib/apply-treatment";
import { getOwnedPestEvent } from "@/lib/pest-events";
import { requireGrowerSession } from "@/lib/session";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string; eventId: string }> }) {
  const session = await requireGrowerSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, eventId } = await params;
  const event = await getOwnedPestEvent(id, eventId, session.organizationId!);
  if (!event) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const rows = await db.select().from(treatments).where(eq(treatments.pestEventId, eventId));
  return NextResponse.json(rows);
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string; eventId: string }> }) {
  const session = await requireGrowerSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, eventId } = await params;
  const event = await getOwnedPestEvent(id, eventId, session.organizationId!);
  if (!event) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await request.json();
  if (!treatmentTypeEnum.enumValues.includes(body.type)) {
    return NextResponse.json({ error: "invalid type" }, { status: 400 });
  }

  const row = await insertTreatmentAndDecrementStock(session.organizationId!, {
    facilityId: id,
    pestEventId: eventId,
    // Inherits the parent event's own pin -- see db/schema.ts's comment on
    // treatments.x/y (only standalone/Application-log treatments set these
    // directly).
    x: event.x,
    y: event.y,
    type: body.type,
    product: typeof body.product === "string" && body.product ? body.product : null,
    targetPest: typeof body.targetPest === "string" && body.targetPest ? body.targetPest : event.pestSpecies,
    inventoryItemId: typeof body.inventoryItemId === "string" ? body.inventoryItemId : null,
    quantityUsed: typeof body.quantityUsed === "number" ? body.quantityUsed : null,
    operatorUserId: session.user?.id ?? null,
    notes: typeof body.notes === "string" && body.notes ? body.notes : null,
    minutesSpent: typeof body.minutesSpent === "number" ? body.minutesSpent : null,
  });
  return NextResponse.json(row);
}
