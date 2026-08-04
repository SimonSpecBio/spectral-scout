import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { facilityAreas, scoutingObservations } from "@/db/schema";
import { getOwnedFacility } from "@/lib/facilities";
import { requireGrowerSession } from "@/lib/session";

// Routine scouting, independent of any Pest Event -- promotedPestEventId
// stays null here (the general Scouting flow the schema's comment always
// intended: log first, promote to a Pest Event later if something's found).
// Mirrors pest-events/[eventId]/monitoring/route.ts's POST almost exactly;
// the only real difference is what promotedPestEventId gets set to.
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
  const sampleSize = typeof body.sampleSize === "number" ? body.sampleSize : null;
  const pestCount = typeof body.pestCount === "number" ? body.pestCount : null;
  if (sampleSize == null || pestCount == null) {
    return NextResponse.json({ error: "sampleSize and pestCount are required" }, { status: 400 });
  }

  const [row] = await db
    .insert(scoutingObservations)
    .values({
      organizationId: session.organizationId!,
      facilityAreaId: areaId,
      submittedByUserId: session.user!.id!,
      date: new Date().toISOString().slice(0, 10),
      sampleSize,
      pestCount,
    })
    .returning();
  return NextResponse.json(row);
}
