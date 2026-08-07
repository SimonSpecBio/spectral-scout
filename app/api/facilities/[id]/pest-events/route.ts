import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { eventKindEnum, facilityAreas, pestEvents, severityEnum } from "@/db/schema";
import { getOwnedFacility } from "@/lib/facilities";
import { requireGrowerSession } from "@/lib/session";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireGrowerSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const facility = await getOwnedFacility(id, session.organizationId!);
  if (!facility) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const areaId = request.nextUrl.searchParams.get("areaId");
  const rows = await db
    .select()
    .from(pestEvents)
    .where(areaId ? and(eq(pestEvents.facilityId, id), eq(pestEvents.facilityAreaId, areaId)) : eq(pestEvents.facilityId, id));
  return NextResponse.json(rows);
}

// A dropped pin -- x/y on the area's canvas is the source of truth for
// location, not a hard FK to a specific drawn bench/row (see db/schema.ts).
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireGrowerSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const facility = await getOwnedFacility(id, session.organizationId!);
  if (!facility) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await request.json();
  const pestSpecies = typeof body.pestSpecies === "string" ? body.pestSpecies.trim() : "";
  if (!pestSpecies) return NextResponse.json({ error: "pestSpecies is required" }, { status: 400 });
  const severity = severityEnum.enumValues.includes(body.severity) ? body.severity : "moderate";
  const kind = eventKindEnum.enumValues.includes(body.kind) ? body.kind : "pest";

  // Client-supplied and only type-checked below otherwise -- verify it
  // actually belongs to this facility before trusting it, same reasoning
  // as every other cross-referenced id fixed this pass (an unowned area id
  // would otherwise leak another org's area name into this event's views).
  let facilityAreaId: string | null = null;
  if (typeof body.facilityAreaId === "string") {
    const [area] = await db
      .select()
      .from(facilityAreas)
      .where(and(eq(facilityAreas.id, body.facilityAreaId), eq(facilityAreas.facilityId, id)));
    if (area) facilityAreaId = area.id;
  }

  const [row] = await db
    .insert(pestEvents)
    .values({
      facilityId: id,
      facilityAreaId,
      mapObjectId: typeof body.mapObjectId === "string" ? body.mapObjectId : null,
      x: typeof body.x === "number" ? body.x : null,
      y: typeof body.y === "number" ? body.y : null,
      kind,
      pestSpecies,
      scientificName: typeof body.scientificName === "string" && body.scientificName ? body.scientificName : null,
      severity,
      notes: typeof body.notes === "string" && body.notes ? body.notes : null,
    })
    .returning();
  return NextResponse.json(row);
}
