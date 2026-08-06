import { and, eq, inArray } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { facilityAreas, trapReadings, traps } from "@/db/schema";
import { getOwnedFacility } from "@/lib/facilities";
import { requireGrowerSession } from "@/lib/session";

// One reading *session* logs a count for every trap in the area's network
// against a single target pest species in one pass (matching how a grower
// actually walks a trap network), so this inserts one scout_trap_reading
// row per trap in a single request rather than the client making N calls.
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
  const pestSpecies = typeof body.pestSpecies === "string" ? body.pestSpecies.trim() : "";
  const daysDeployed = typeof body.daysDeployed === "number" && body.daysDeployed > 0 ? body.daysDeployed : null;
  const readings = Array.isArray(body.readings) ? body.readings : [];
  if (!pestSpecies || !daysDeployed || readings.length === 0) {
    return NextResponse.json({ error: "pestSpecies, daysDeployed, and readings are required" }, { status: 400 });
  }

  // Server-authoritative membership check: every trapId in the payload must
  // actually belong to this area, not just be a well-formed uuid the client
  // sent -- otherwise a crafted request could write readings onto another
  // org's trap.
  const areaTraps = await db.select().from(traps).where(and(eq(traps.facilityId, id), eq(traps.facilityAreaId, areaId)));
  const areaTrapIds = new Set(areaTraps.map((t) => t.id));

  const values = readings
    .filter((r: unknown): r is { trapId: string; count: number } => {
      const rec = r as Record<string, unknown>;
      return typeof rec.trapId === "string" && areaTrapIds.has(rec.trapId) && typeof rec.count === "number" && rec.count >= 0;
    })
    .map((r: { trapId: string; count: number }) => ({
      trapId: r.trapId,
      pestSpecies,
      count: r.count,
      daysDeployed,
      submittedByUserId: session.user!.id!,
    }));
  if (values.length === 0) return NextResponse.json({ error: "No valid readings" }, { status: 400 });

  const rows = await db.insert(trapReadings).values(values).returning();
  return NextResponse.json(rows);
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string; areaId: string }> }) {
  const session = await requireGrowerSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, areaId } = await params;
  const facility = await getOwnedFacility(id, session.organizationId!);
  if (!facility) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const areaTraps = await db.select().from(traps).where(and(eq(traps.facilityId, id), eq(traps.facilityAreaId, areaId)));
  const trapIds = areaTraps.map((t) => t.id);
  if (trapIds.length === 0) return NextResponse.json([]);

  const rows = await db.select().from(trapReadings).where(inArray(trapReadings.trapId, trapIds));
  return NextResponse.json(rows);
}
