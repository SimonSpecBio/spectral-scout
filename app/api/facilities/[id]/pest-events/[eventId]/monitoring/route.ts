import { and, desc, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { facilityAreas, pestEvents, scoutingObservations, tasks } from "@/db/schema";
import { aggregateDiseaseGrid, severityFromDiseaseAggregate, type DiseaseLeaves } from "@/lib/disease";
import { locationLabel } from "@/lib/floorplan-bays";
import { parseMonitoringPayload } from "@/lib/monitoring";
import { getOwnedPestEvent } from "@/lib/pest-events";
import { notifyTaskAssigned } from "@/lib/push";
import { requireGrowerSession } from "@/lib/session";
import { maybeScheduleKeepAnEyeRecheck } from "@/lib/tasks";
import { getSpeciesThresholds, maybeAutoResolve, sessionMetric } from "@/lib/threshold-engine";

const DAY_MS = 86_400_000;

export async function GET(_request: Request, { params }: { params: Promise<{ id: string; eventId: string }> }) {
  const session = await requireGrowerSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, eventId } = await params;
  const event = await getOwnedPestEvent(id, eventId, session.organizationId!);
  if (!event) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const rows = await db
    .select()
    .from(scoutingObservations)
    .where(eq(scoutingObservations.promotedPestEventId, eventId))
    .orderBy(desc(scoutingObservations.createdAt));
  return NextResponse.json(rows);
}

// One row per completed guided-monitoring session -- sampleSize/pestCount
// here are the same fields spectral-pilot's proven ReportForm density calc
// uses (density = pestCount/sampleSize), just fed by the tap-through
// protocol's aggregate instead of a single manual count. promotedPestEventId
// links straight to this event at creation (the column's original intent --
// an unlinked observation later escalated into a pest event -- still works
// for the general Scouting flow when that gets built; this is the other
// direction, created already-linked).
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string; eventId: string }> }) {
  const session = await requireGrowerSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, eventId } = await params;
  const event = await getOwnedPestEvent(id, eventId, session.organizationId!);
  if (!event) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!event.facilityAreaId) {
    return NextResponse.json({ error: "Event has no facility area to monitor" }, { status: 400 });
  }

  const parsed = parseMonitoringPayload(await request.json());
  if (!parsed) return NextResponse.json({ error: "sampleSize and pestCount are required" }, { status: 400 });

  const [row] = await db
    .insert(scoutingObservations)
    .values({
      organizationId: session.organizationId!,
      facilityAreaId: event.facilityAreaId,
      // Inherits the parent event's own pin -- the location is already
      // known, no reason to make a scout re-place it for a follow-up.
      x: event.x,
      y: event.y,
      submittedByUserId: session.user!.id!,
      date: new Date().toISOString().slice(0, 10),
      promotedPestEventId: eventId,
      ...parsed,
    })
    .returning();

  // Logging a monitoring session directly on the hotspot (rather than
  // through the scheduled recheck task's own action link) left that task
  // stuck open/overdue forever -- nothing else ever marked it done (ticket
  // found in QA, 2026-09-03). This session fulfills the exact purpose of
  // any open recheck-type (type "monitor") task tied to this same event,
  // whether it was auto-scheduled or created by hand, so complete it here
  // regardless of which path the grower used. Appends how many days late
  // it was to the title so Logs/Timeline (which just render a task's
  // title) surface that instead of it silently disappearing as on-time.
  const openRecheckTasks = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.pestEventId, eventId), eq(tasks.type, "monitor"), eq(tasks.status, "open")));
  for (const t of openRecheckTasks) {
    const daysLate = Math.floor((Date.now() - t.dueAt.getTime()) / DAY_MS);
    await db
      .update(tasks)
      .set({
        status: "done",
        completedAt: new Date(),
        completedByUserId: session.user!.id!,
        title: daysLate > 0 ? `${t.title} (${daysLate}d late)` : t.title,
      })
      .where(eq(tasks.id, t.id));
  }

  // Pathogen events never had a live severity-update path at all (severity
  // was only ever set once, at creation) -- pest thresholds/auto-resolve/
  // keep-an-eye-recheck below are all density-or-percent-vs-threshold logic
  // that was never built for a disease's 0-4 % leaf-area severity scale, so
  // this branches out before any of that runs (ticket C1). Recomputed
  // server-side from the submitted grid rather than trusting a client-sent
  // severity value.
  if (event.kind === "pathogen" && row.assessmentType === "disease_severity" && Array.isArray(row.leafGrid)) {
    const agg = aggregateDiseaseGrid(row.leafGrid as DiseaseLeaves[]);
    const severity = severityFromDiseaseAggregate(agg);
    await db.update(pestEvents).set({ severity }).where(eq(pestEvents.id, eventId));
    return NextResponse.json({ ...row, autoResolvedEvent: false });
  }

  // "Once an infestation is under control, the event closes itself" --
  // checked right after the session that could make it true. autoResolved
  // is included so the client can show an immediate confirmation instead
  // of the grower only finding out later via Notifications.
  const resolved = await maybeAutoResolve(eventId, session.organizationId!);

  // A reading under threshold but still nonzero ("essentially nothing, but
  // keep an eye on it") gets a low-urgency recheck on the schedule instead
  // of just vanishing back into "no alert" -- see maybeScheduleKeepAnEyeRecheck.
  if (!resolved) {
    const metric = sessionMetric(row);
    if (metric) {
      const thresholds = await getSpeciesThresholds(session.organizationId!, event.pestSpecies);
      // 0 for a presence-triggered species -- with value <= 0 already
      // excluded above, this makes maybeScheduleKeepAnEyeRecheck's
      // value >= threshold check always true, correctly skipping it (no
      // "under threshold but nonzero" state exists when any detection at
      // all is already over threshold).
      const threshold = thresholds.presenceTriggered ? 0 : metric.kind === "density" ? thresholds.density : thresholds.pct;
      // Falls back to the area's name, not the pest's own species -- used
      // to produce a visibly duplicated task title like "Keep an eye on
      // Whitefly — Whitefly" for an unpinned event (ticket found in a
      // manager-persona walkthrough, 2026-08-27).
      const [monitorArea] = await db.select({ name: facilityAreas.name }).from(facilityAreas).where(eq(facilityAreas.id, event.facilityAreaId!));
      const newRecheckTask = await maybeScheduleKeepAnEyeRecheck({
        organizationId: session.organizationId!,
        facilityId: id,
        facilityAreaId: event.facilityAreaId!,
        pestEventId: eventId,
        pestSpecies: event.pestSpecies,
        locationLabel: locationLabel(event.x, event.y, monitorArea?.name ?? null),
        metricKind: metric.kind,
        value: metric.value,
        threshold,
        x: event.x,
        y: event.y,
      });
      if (newRecheckTask) await notifyTaskAssigned(newRecheckTask);
    }
  }

  return NextResponse.json({ ...row, autoResolvedEvent: resolved });
}
