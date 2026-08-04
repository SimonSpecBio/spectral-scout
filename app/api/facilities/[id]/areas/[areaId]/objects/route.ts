import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { facilityAreas, facilityMapObjects, shapeTypeEnum } from "@/db/schema";
import { getOwnedFacility } from "@/lib/facilities";
import { requireGrowerSession } from "@/lib/session";

async function ownedArea(facilityId: string, areaId: string, organizationId: string) {
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
  const area = await ownedArea(id, areaId, session.organizationId!);
  if (!area) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const rows = await db.select().from(facilityMapObjects).where(eq(facilityMapObjects.facilityAreaId, areaId));
  return NextResponse.json(rows);
}

// Generic shape create -- geometry/style/metadata are trusted as opaque
// jsonb from the client (this is a drawing tool operating on the caller's
// own facility area, not user-generated content shown to anyone else), the
// only server-enforced fields are shapeType and facilityAreaId ownership.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string; areaId: string }> }) {
  const session = await requireGrowerSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, areaId } = await params;
  const area = await ownedArea(id, areaId, session.organizationId!);
  if (!area) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await request.json();
  if (!shapeTypeEnum.enumValues.includes(body.shapeType)) {
    return NextResponse.json({ error: "invalid shapeType" }, { status: 400 });
  }

  const [row] = await db
    .insert(facilityMapObjects)
    .values({
      facilityAreaId: areaId,
      shapeType: body.shapeType,
      geometry: body.geometry ?? {},
      style: body.style ?? null,
      label: typeof body.label === "string" ? body.label : null,
      metadata: body.metadata ?? null,
      zIndex: typeof body.zIndex === "number" ? body.zIndex : 0,
    })
    .returning();
  return NextResponse.json(row);
}
