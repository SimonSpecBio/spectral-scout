import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { facilityAreas, traps } from "@/db/schema";
import { getOwnedFacility } from "@/lib/facilities";
import { requireGrowerSession } from "@/lib/session";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string; areaId: string }> }) {
  const session = await requireGrowerSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, areaId } = await params;
  const facility = await getOwnedFacility(id, session.organizationId!);
  if (!facility) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const rows = await db
    .select()
    .from(traps)
    .where(and(eq(traps.facilityId, id), eq(traps.facilityAreaId, areaId)))
    .orderBy(traps.createdAt);
  return NextResponse.json(rows);
}

// A dropped pin, same convention as pest events -- x/y is the source of
// truth for location, not a hard FK to a drawn bench (see db/schema.ts).
// label auto-numbers "Trap N" against the area's existing trap count.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string; areaId: string }> }) {
  const session = await requireGrowerSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, areaId } = await params;
  const facility = await getOwnedFacility(id, session.organizationId!);
  if (!facility) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const [area] = await db
    .select()
    .from(facilityAreas)
    .where(and(eq(facilityAreas.id, areaId), eq(facilityAreas.facilityId, id)));
  if (!area) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await request.json();
  const x = typeof body.x === "number" ? body.x : null;
  const y = typeof body.y === "number" ? body.y : null;
  if (x == null || y == null) return NextResponse.json({ error: "x and y are required" }, { status: 400 });

  const existing = await db.select().from(traps).where(and(eq(traps.facilityId, id), eq(traps.facilityAreaId, areaId)));
  const label = typeof body.label === "string" && body.label.trim() ? body.label.trim() : `Trap ${existing.length + 1}`;

  const [row] = await db.insert(traps).values({ facilityId: id, facilityAreaId: areaId, x, y, label }).returning();
  return NextResponse.json(row);
}
