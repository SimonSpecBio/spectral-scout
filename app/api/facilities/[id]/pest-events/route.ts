import { and, desc, eq, isNull } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { eventKindEnum, facilityAreas, facilityMapObjects, inventoryItems, pestEvents, scoutingObservations, severityEnum, tasks } from "@/db/schema";
import { locationLabel } from "@/lib/floorplan-bays";
import { getOwnedFacility } from "@/lib/facilities";
import { parseMonitoringPayload } from "@/lib/monitoring";
import { requireGrowerSession } from "@/lib/session";
import { assignLeastLoadedWorker } from "@/lib/tasks";
import { findAgent, findPestProgram, findProduct, resolveCanonicalPestId } from "@/lib/treatments-catalog";

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
  const rawPestSpecies = typeof body.pestSpecies === "string" ? body.pestSpecies.trim() : "";
  if (!rawPestSpecies) return NextResponse.json({ error: "pestSpecies is required" }, { status: 400 });
  // Stored going forward as the catalog id ("pest_tssm"), not whatever the
  // grower/scouting-session actually typed -- "PM" and "powdery mildew"
  // used to create two visually-different-but-identical open cases in the
  // same area. Falls through to the raw text unchanged for a genuine
  // species the catalog/alias map doesn't cover.
  const pestSpecies = resolveCanonicalPestId(rawPestSpecies);
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

  // Same re-verification as facilityAreaId above (ticket 101 -- this
  // previously trusted the client-supplied id with only a type check).
  // facilityMapObjects belongs to an area, not the facility directly, so
  // it's only ever trusted once facilityAreaId itself has already been
  // confirmed to belong to this facility.
  let mapObjectId: string | null = null;
  if (typeof body.mapObjectId === "string" && facilityAreaId) {
    const [mapObject] = await db
      .select()
      .from(facilityMapObjects)
      .where(and(eq(facilityMapObjects.id, body.mapObjectId), eq(facilityMapObjects.facilityAreaId, facilityAreaId)));
    if (mapObject) mapObjectId = mapObject.id;
  }

  // One open case per pest per area -- a re-scout of the same (now-
  // canonicalized) pest in the same area should update the existing case,
  // not open a visually-identical twin next to it. Only applies once an
  // area is actually known; a pin-less event (no facilityAreaId) has
  // nothing to dedupe against.
  let row: typeof pestEvents.$inferSelect;
  const existingOpenCase = facilityAreaId
    ? (
        await db
          .select()
          .from(pestEvents)
          .where(
            and(
              eq(pestEvents.facilityAreaId, facilityAreaId),
              eq(pestEvents.pestSpecies, pestSpecies),
              eq(pestEvents.status, "active")
            )
          )
      )[0]
    : undefined;

  if (existingOpenCase) {
    row = existingOpenCase;
  } else {
    [row] = await db
      .insert(pestEvents)
      .values({
        facilityId: id,
        facilityAreaId,
        mapObjectId,
        x: typeof body.x === "number" ? body.x : null,
        y: typeof body.y === "number" ? body.y : null,
        kind,
        pestSpecies,
        scientificName: typeof body.scientificName === "string" && body.scientificName ? body.scientificName : null,
        severity,
        notes: typeof body.notes === "string" && body.notes ? body.notes : null,
        createdByUserId: session.user!.id!,
      })
      .returning();
  }

  // An initial assessment (e.g. the disease-event form's leaf-severity grid)
  // taken at creation time, folded into this same request instead of a
  // second dependent POST that needs this event's just-generated id --
  // queuedFetch only handles independent requests, so a second call here
  // would have nothing to attach to if this whole request queues offline
  // (ticket: disease-event severity grid silently dropped when the parent
  // submission queues offline). Same parseMonitoringPayload the two
  // monitoring routes already use, so this stays one validated shape.
  let initialMonitoring = null;
  if (facilityAreaId && body.initialMonitoring) {
    const parsed = parseMonitoringPayload(body.initialMonitoring);
    if (parsed) {
      [initialMonitoring] = await db
        .insert(scoutingObservations)
        .values({
          organizationId: session.organizationId!,
          facilityAreaId,
          x: row.x,
          y: row.y,
          submittedByUserId: session.user!.id!,
          date: new Date().toISOString().slice(0, 10),
          promotedPestEventId: row.id,
          ...parsed,
        })
        .returning();
    }
  }

  // Confirming a scouting alert into an event (lib/scouting-alerts.ts)
  // links the originating session as this event's first monitoring
  // session -- ownership- and area-verified before trusting it, same
  // pattern as facilityAreaId above. Without this the session would stay
  // "unpromoted" and keep re-surfacing as a scouting alert forever even
  // though the grower already acted on it.
  if (typeof body.sourceObservationId === "string" && facilityAreaId) {
    await db
      .update(scoutingObservations)
      .set({ promotedPestEventId: row.id })
      .where(
        and(
          eq(scoutingObservations.id, body.sourceObservationId),
          eq(scoutingObservations.organizationId, session.organizationId!),
          eq(scoutingObservations.facilityAreaId, facilityAreaId)
        )
      );
  } else if (facilityAreaId) {
    // A pest event created any other way (the generic "+New" flow, not the
    // scouting alert's own confirm link) for an area that already has an
    // unpromoted general scouting session sitting over threshold: link the
    // latest one anyway. Without this fallback, a grower who reasonably
    // used "+New" instead of chasing down that specific alert's confirm
    // link left the origin observation stranded unpromoted forever -- it
    // kept re-alerting on the same already-acted-on data (manager-persona
    // walkthrough, 2026-08-20). Best-effort only: picks the latest
    // unpromoted session for the area regardless of species, since general
    // scouting never captures one to match against.
    const [latestUnpromoted] = await db
      .select({ id: scoutingObservations.id })
      .from(scoutingObservations)
      .where(and(eq(scoutingObservations.facilityAreaId, facilityAreaId), isNull(scoutingObservations.promotedPestEventId)))
      .orderBy(desc(scoutingObservations.createdAt))
      .limit(1);
    if (latestUnpromoted) {
      await db.update(scoutingObservations).set({ promotedPestEventId: row.id }).where(eq(scoutingObservations.id, latestUnpromoted.id));
    }
  }

  // A Severe hotspot shouldn't just sit there until someone remembers to
  // check back on it -- auto-create the recheck (and, where possible, the
  // treatment) tasks a grower would otherwise have to remember to schedule
  // by hand. Mirrors apply-program/route.ts's recheck+release pattern, just
  // triggered at event-creation time instead of at treatment time, since a
  // Severe event needs a plan immediately, not only after something's
  // already been applied. Gated on !existingOpenCase -- this used to run
  // unconditionally on every POST that resolved to "severe," so re-scouting
  // the same pest in the same area (previously always a distinct case
  // before pestSpecies was canonicalized) fanned out a fresh set of
  // recheck/treatment tasks each time. Now it only fires once, when the
  // case is actually created.
  const createdTasks: (typeof tasks.$inferSelect)[] = [];
  if (!existingOpenCase && severity === "severe" && facilityAreaId) {
    const DAY_MS = 86_400_000;
    const program = findPestProgram(pestSpecies);
    // Falls back to the area's name, not the pest's own species -- an event
    // with no pin used to produce a visibly duplicated title like "Recheck
    // Whitefly — Whitefly" (ticket found in a manager-persona walkthrough,
    // 2026-08-27). facilityAreaId is guaranteed non-null by this branch's
    // own condition, so the area is always resolvable here.
    const [severeArea] = await db.select({ name: facilityAreas.name }).from(facilityAreas).where(eq(facilityAreas.id, facilityAreaId));
    const location = locationLabel(row.x, row.y, severeArea?.name ?? null);
    const suffix = location ? ` — ${location}` : "";
    const assigneeUserId = await assignLeastLoadedWorker(session.organizationId!);

    const [recheckTask] = await db
      .insert(tasks)
      .values({
        organizationId: session.organizationId!,
        title: `Recheck ${pestSpecies}${suffix}`,
        type: "monitor",
        facilityId: id,
        facilityAreaId,
        pestEventId: row.id,
        x: row.x,
        y: row.y,
        assigneeUserId,
        createdByUserId: session.user!.id!,
        source: "auto_trigger",
        dueAt: new Date(Date.now() + (program?.followUp?.recheckDays ?? 3) * DAY_MS),
      })
      .returning();
    createdTasks.push(recheckTask);

    // Try to match the program's top recommended agent/product against
    // stock the org already has, same name-match apply-program's route
    // uses -- if it's in Inventory, schedule applying it instead of a
    // vague placeholder. No program, or no matching stock: fall back to
    // two generic placeholders (tomorrow, and a week out) the grower can
    // use as-is and complete/delete whichever doesn't fit, rather than
    // leaving Severe with nothing scheduled just because nothing matched.
    const agent = program?.primaryBiocontrol[0] ? findAgent(program.primaryBiocontrol[0]) : undefined;
    const productName = agent?.name ?? (program?.biopesticideRotation[0] ? findProduct(program.biopesticideRotation[0])?.name : undefined);
    const orgItems = productName
      ? await db.select().from(inventoryItems).where(eq(inventoryItems.organizationId, session.organizationId!))
      : [];
    const matchedItem = productName ? orgItems.find((i) => i.name.toLowerCase() === productName.toLowerCase()) : undefined;

    if (productName && matchedItem) {
      const [treatmentTask] = await db
        .insert(tasks)
        .values({
          organizationId: session.organizationId!,
          title: `Apply ${productName}${suffix}`,
          type: "treatment",
          facilityId: id,
          facilityAreaId,
          pestEventId: row.id,
          x: row.x,
          y: row.y,
          assigneeUserId,
          createdByUserId: session.user!.id!,
          source: "auto_trigger",
          dueAt: new Date(Date.now() + DAY_MS),
        })
        .returning();
      createdTasks.push(treatmentTask);
    } else {
      const [tomorrowTask, weekOutTask] = await db
        .insert(tasks)
        .values([
          {
            organizationId: session.organizationId!,
            title: `Treat ${pestSpecies}${suffix}`,
            type: "treatment",
            facilityId: id,
            facilityAreaId,
            pestEventId: row.id,
            x: row.x,
            y: row.y,
            assigneeUserId,
            createdByUserId: session.user!.id!,
            source: "auto_trigger",
            dueAt: new Date(Date.now() + DAY_MS),
          },
          {
            organizationId: session.organizationId!,
            title: `Treat ${pestSpecies}${suffix}`,
            type: "treatment",
            facilityId: id,
            facilityAreaId,
            pestEventId: row.id,
            x: row.x,
            y: row.y,
            assigneeUserId,
            createdByUserId: session.user!.id!,
            source: "auto_trigger",
            dueAt: new Date(Date.now() + 7 * DAY_MS),
          },
        ])
        .returning();
      createdTasks.push(tomorrowTask, weekOutTask);
    }
  }

  return NextResponse.json({ ...row, autoCreatedTasks: createdTasks, initialMonitoring });
}
