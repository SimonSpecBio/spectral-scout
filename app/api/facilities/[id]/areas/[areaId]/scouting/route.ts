import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { facilityAreas, scoutingObservations } from "@/db/schema";
import { bayLabel, nearestBay } from "@/lib/floorplan-bays";
import { getOwnedFacility } from "@/lib/facilities";
import { parseMonitoringPayload } from "@/lib/monitoring";
import { requireGrowerSession } from "@/lib/session";
import { maybeScheduleKeepAnEyeRecheck } from "@/lib/tasks";
import { DEFAULT_DENSITY_THRESHOLD, DEFAULT_INFESTED_PCT_THRESHOLD, sessionMetric } from "@/lib/threshold-engine";

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
  const parsed = parseMonitoringPayload(body);
  if (!parsed) return NextResponse.json({ error: "sampleSize and pestCount are required" }, { status: 400 });

  const [row] = await db
    .insert(scoutingObservations)
    .values({
      organizationId: session.organizationId!,
      facilityAreaId: areaId,
      // Optional, same as temp/humidity -- a quick walkthrough shouldn't be
      // blocked on placing a pin (see db/schema.ts's comment on x/y).
      x: typeof body.x === "number" ? body.x : null,
      y: typeof body.y === "number" ? body.y : null,
      submittedByUserId: session.user!.id!,
      date: new Date().toISOString().slice(0, 10),
      ...parsed,
    })
    .returning();

  // No species yet on a general session (see scout_observation's schema
  // comment), so only the generic defaults apply here -- same reasoning
  // computeScoutingAlerts already uses for this flow.
  const metric = sessionMetric(row);
  if (metric) {
    const threshold = metric.kind === "density" ? DEFAULT_DENSITY_THRESHOLD : DEFAULT_INFESTED_PCT_THRESHOLD;
    await maybeScheduleKeepAnEyeRecheck({
      organizationId: session.organizationId!,
      facilityId: id,
      facilityAreaId: areaId,
      pestEventId: null,
      pestSpecies: null,
      locationLabel: row.x != null && row.y != null ? bayLabel(nearestBay(row.x, row.y)) : area.name,
      metricKind: metric.kind,
      value: metric.value,
      threshold,
      x: row.x,
      y: row.y,
    });
  }

  return NextResponse.json(row);
}
