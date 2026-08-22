import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { inventoryItems, tasks, treatmentTypeEnum } from "@/db/schema";
import { insertTreatmentAndDecrementStock } from "@/lib/apply-treatment";
import { bayLabel, nearestBay } from "@/lib/floorplan-bays";
import { getOwnedPestEvent } from "@/lib/pest-events";
import { requireGrowerSession } from "@/lib/session";
import { assignLeastLoadedWorker } from "@/lib/tasks";
import { findPestProgram } from "@/lib/treatments-catalog";

const DAY_MS = 86_400_000;

// "Applying a program to an event auto-creates these tasks" (SCHEDULING.md)
// -- logs one treatment for the picked agent/product and, per the pest's
// followUp cadence, schedules a recheck (always) and a recurring release
// (biocontrol only, when the pest's program has one). source stays
// "auto_program" throughout, distinguishing these from anything a person
// created by hand (screen 17's "+").
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string; eventId: string }> }) {
  const session = await requireGrowerSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, eventId } = await params;
  const event = await getOwnedPestEvent(id, eventId, session.organizationId!);
  if (!event) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await request.json();
  const kind = typeof body.kind === "string" ? body.kind : "";
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name || !["biocontrol", "biopesticide", "chemical", "spectral"].includes(kind)) {
    return NextResponse.json({ error: "kind and name are required" }, { status: 400 });
  }
  const treatmentType: (typeof treatmentTypeEnum.enumValues)[number] =
    kind === "biocontrol" ? "biological" : kind === "spectral" ? "spectral_light" : "pesticide";

  // Link to the real stock record if the org happens to have this exact
  // product/agent in Inventory already (name match) -- same reasoning as
  // matchInventoryStock's comment. No quantityUsed is guessed here, so
  // insertTreatmentAndDecrementStock links the row without decrementing
  // anything; a grower can add a quantity later from the Treatments tab.
  // Spectral's own hardware, not a consumable -- never in Inventory, so
  // there's nothing to name-match or decrement stock against (unlike every
  // other kind here).
  const orgItems =
    kind === "spectral" ? [] : await db.select().from(inventoryItems).where(eq(inventoryItems.organizationId, session.organizationId!));
  const inventoryItemId = orgItems.find((i) => i.name.toLowerCase() === name.toLowerCase())?.id ?? null;

  const treatment = await insertTreatmentAndDecrementStock(session.organizationId!, {
    facilityId: id,
    pestEventId: eventId,
    x: event.x,
    y: event.y,
    type: treatmentType,
    product: name,
    targetPest: event.pestSpecies,
    inventoryItemId,
    quantityUsed: null,
    operatorUserId: session.user?.id ?? null,
    notes: `Applied from recommended program (${kind}).`,
    minutesSpent: typeof body.minutesSpent === "number" ? body.minutesSpent : null,
  });

  const program = findPestProgram(event.pestSpecies);
  const location = event.x != null && event.y != null ? bayLabel(nearestBay(event.x, event.y)) : event.pestSpecies;
  const createdTasks = [];

  if (program?.followUp) {
    // Auto-assigned to a real worker (least open-task load) rather than
    // left unassigned -- see assignLeastLoadedWorker's comment. Computed
    // once and reused for both tasks below so a recheck+release pair from
    // the same apply-program call lands on the same person, not split.
    const assigneeUserId = await assignLeastLoadedWorker(session.organizationId!);

    const [recheckTask] = await db
      .insert(tasks)
      .values({
        organizationId: session.organizationId!,
        title: `Recheck ${event.pestSpecies} — ${location}`,
        type: "monitor",
        facilityId: id,
        facilityAreaId: event.facilityAreaId,
        pestEventId: eventId,
        x: event.x,
        y: event.y,
        assigneeUserId,
        createdByUserId: session.user!.id!,
        source: "auto_program",
        dueAt: new Date(Date.now() + program.followUp.recheckDays * DAY_MS),
      })
      .returning();
    createdTasks.push(recheckTask);

    if (kind === "biocontrol" && program.followUp.releaseIntervalDays > 0) {
      const [releaseTask] = await db
        .insert(tasks)
        .values({
          organizationId: session.organizationId!,
          title: `Release ${name} — ${location}`,
          type: "release",
          facilityId: id,
          facilityAreaId: event.facilityAreaId,
          pestEventId: eventId,
          x: event.x,
          y: event.y,
          assigneeUserId,
          createdByUserId: session.user!.id!,
          source: "auto_program",
          dueAt: new Date(Date.now() + program.followUp.releaseIntervalDays * DAY_MS),
          repeatEveryDays: program.followUp.releaseIntervalDays,
        })
        .returning();
      createdTasks.push(releaseTask);
    }
  }

  return NextResponse.json({ treatment, tasks: createdTasks });
}
