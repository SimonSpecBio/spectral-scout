import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { facilityAreas, facilityMapObjects } from "@/db/schema";
import { getOwnedFacility } from "@/lib/facilities";
import { requireGrowerSession } from "@/lib/session";

async function ownedObject(facilityId: string, areaId: string, objectId: string, organizationId: string) {
  const facility = await getOwnedFacility(facilityId, organizationId);
  if (!facility) return null;
  const [area] = await db
    .select()
    .from(facilityAreas)
    .where(and(eq(facilityAreas.id, areaId), eq(facilityAreas.facilityId, facilityId)));
  if (!area) return null;
  const [object] = await db
    .select()
    .from(facilityMapObjects)
    .where(and(eq(facilityMapObjects.id, objectId), eq(facilityMapObjects.facilityAreaId, areaId)));
  return object ?? null;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; areaId: string; objectId: string }> }
) {
  const session = await requireGrowerSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, areaId, objectId } = await params;
  const object = await ownedObject(id, areaId, objectId, session.organizationId!);
  if (!object) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await request.json();
  const updates: Partial<typeof facilityMapObjects.$inferInsert> = { updatedAt: new Date() };
  if (body.geometry !== undefined) updates.geometry = body.geometry;
  if (body.style !== undefined) updates.style = body.style;
  if (body.metadata !== undefined) updates.metadata = body.metadata;
  if (typeof body.label === "string") updates.label = body.label;
  if (typeof body.zIndex === "number") updates.zIndex = body.zIndex;

  const [row] = await db
    .update(facilityMapObjects)
    .set(updates)
    .where(eq(facilityMapObjects.id, objectId))
    .returning();
  return NextResponse.json(row);
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; areaId: string; objectId: string }> }
) {
  const session = await requireGrowerSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, areaId, objectId } = await params;
  const object = await ownedObject(id, areaId, objectId, session.organizationId!);
  if (!object) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await db.delete(facilityMapObjects).where(eq(facilityMapObjects.id, objectId));
  return NextResponse.json({ ok: true });
}
