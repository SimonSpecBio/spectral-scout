import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { facilityAreas } from "@/db/schema";
import { getOwnedFacility } from "@/lib/facilities";
import { requireGrowerSession } from "@/lib/session";

async function loadOwnedArea(facilityId: string, areaId: string, organizationId: string) {
  const facility = await getOwnedFacility(facilityId, organizationId);
  if (!facility) return null;
  const [area] = await db
    .select()
    .from(facilityAreas)
    .where(and(eq(facilityAreas.id, areaId), eq(facilityAreas.facilityId, facilityId)));
  return area ?? null;
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string; areaId: string }> }) {
  const session = await requireGrowerSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, areaId } = await params;
  const area = await loadOwnedArea(id, areaId, session.organizationId!);
  if (!area) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json(area);
}

// Used for both renaming/notes edits and setting the background reference
// image (upload or satellite-by-address) + its real-world scale.
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string; areaId: string }> }) {
  const session = await requireGrowerSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, areaId } = await params;
  const area = await loadOwnedArea(id, areaId, session.organizationId!);
  if (!area) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await request.json();
  const updates: Partial<typeof facilityAreas.$inferInsert> = { updatedAt: new Date() };
  if (typeof body.name === "string" && body.name.trim()) updates.name = body.name.trim();
  if (typeof body.cropType === "string") updates.cropType = body.cropType || null;
  if (typeof body.notes === "string") updates.notes = body.notes || null;
  if (typeof body.backgroundImageUrl === "string") updates.backgroundImageUrl = body.backgroundImageUrl || null;
  if (typeof body.backgroundScale === "number") updates.backgroundScale = body.backgroundScale;

  const [row] = await db.update(facilityAreas).set(updates).where(eq(facilityAreas.id, areaId)).returning();
  return NextResponse.json(row);
}
