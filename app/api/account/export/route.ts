import { eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/auth-schema";
import {
  customSpecies,
  facilities,
  facilityAreas,
  inventoryItems,
  inventoryOrders,
  monitoringThresholds,
  observationPhotos,
  organizations,
  pestEventComments,
  pestEvents,
  scoutingObservations,
  tasks,
  trapReadings,
  traps,
  treatments,
} from "@/db/schema";
import { requireGrowerSession } from "@/lib/session";

// Data export (CCPA/CPRA right to know + portability, and the GDPR
// equivalent for any future EU users) -- any org member can export their
// own org's data, same as they can already read all of it in the app.
// Scoped by organizationId throughout, same convention every other route in
// this app uses. Ships as a plain JSON download rather than a queued/
// emailed report: this is a read of data the requester can already see
// live in the app, so there's no separate verification step needed beyond
// the session they already have.
export async function GET() {
  const session = await requireGrowerSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const orgId = session.organizationId!;
  const [org] = await db.select().from(organizations).where(eq(organizations.id, orgId));
  const [me] = await db.select().from(users).where(eq(users.id, session.user!.id!));
  const orgFacilities = await db.select().from(facilities).where(eq(facilities.organizationId, orgId));
  const facilityIds = orgFacilities.map((f) => f.id);

  const filteredAreas = facilityIds.length ? await db.select().from(facilityAreas).where(inArray(facilityAreas.facilityId, facilityIds)) : [];
  const events = facilityIds.length ? await db.select().from(pestEvents).where(inArray(pestEvents.facilityId, facilityIds)) : [];
  const eventIds = events.map((e) => e.id);
  const orgInventory = await db.select().from(inventoryItems).where(eq(inventoryItems.organizationId, orgId));
  const itemIds = orgInventory.map((i) => i.id);
  const filteredTraps = facilityIds.length ? await db.select().from(traps).where(inArray(traps.facilityId, facilityIds)) : [];
  const trapIds = filteredTraps.map((t) => t.id);

  const [filteredTreatments, orgObservations, filteredPhotos, filteredComments, filteredOrders, filteredReadings, orgTasks, orgSpecies, orgThresholds] =
    await Promise.all([
      facilityIds.length ? db.select().from(treatments).where(inArray(treatments.facilityId, facilityIds)) : [],
      db.select().from(scoutingObservations).where(eq(scoutingObservations.organizationId, orgId)),
      eventIds.length ? db.select().from(observationPhotos).where(inArray(observationPhotos.pestEventId, eventIds)) : [],
      eventIds.length ? db.select().from(pestEventComments).where(inArray(pestEventComments.pestEventId, eventIds)) : [],
      itemIds.length ? db.select().from(inventoryOrders).where(inArray(inventoryOrders.itemId, itemIds)) : [],
      trapIds.length ? db.select().from(trapReadings).where(inArray(trapReadings.trapId, trapIds)) : [],
      db.select().from(tasks).where(eq(tasks.organizationId, orgId)),
      db.select().from(customSpecies).where(eq(customSpecies.organizationId, orgId)),
      db.select().from(monitoringThresholds).where(eq(monitoringThresholds.organizationId, orgId)),
    ]);

  const exportData = {
    exportedAt: new Date().toISOString(),
    account: { name: me?.name ?? null, email: me?.email ?? null, role: session.membershipRole },
    organization: org,
    facilities: orgFacilities,
    facilityAreas: filteredAreas,
    pestEvents: events,
    treatments: filteredTreatments,
    scoutingObservations: orgObservations,
    photos: filteredPhotos,
    comments: filteredComments,
    inventoryItems: orgInventory,
    inventoryOrders: filteredOrders,
    traps: filteredTraps,
    trapReadings: filteredReadings,
    tasks: orgTasks,
    customSpecies: orgSpecies,
    monitoringThresholds: orgThresholds,
  };

  return new NextResponse(JSON.stringify(exportData, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="spectral-scout-export-${new Date().toISOString().slice(0, 10)}.json"`,
    },
  });
}
