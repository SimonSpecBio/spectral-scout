import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { areaKindEnum, facilityAreas } from "@/db/schema";
import { getOwnedFacility } from "@/lib/facilities";
import { requireGrowerSession } from "@/lib/session";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireGrowerSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const facility = await getOwnedFacility(id, session.organizationId!);
  if (!facility) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const rows = await db.select().from(facilityAreas).where(eq(facilityAreas.facilityId, id));
  return NextResponse.json(rows);
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireGrowerSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const facility = await getOwnedFacility(id, session.organizationId!);
  if (!facility) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await request.json();
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });
  const kind = areaKindEnum.enumValues.includes(body.kind) ? body.kind : "other";

  // A fresh area starts with zero map objects on purpose (ticket 102,
  // reverting the old pre-map-redesign default-2x2-grid behavior) -- Tier 1
  // of the map redesign (LayoutPicker.tsx) only renders its preset picker
  // and photo/floor-plan upload option when objects.length === 0, so
  // pre-populating zones here made that entire feature unreachable.
  const [row] = await db
    .insert(facilityAreas)
    .values({
      facilityId: id,
      name,
      kind,
      cropType: typeof body.cropType === "string" && body.cropType ? body.cropType : null,
    })
    .returning();

  return NextResponse.json(row);
}
