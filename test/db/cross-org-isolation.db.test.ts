// @vitest-environment node
import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import {
  facilities,
  inventoryItems,
  pestEvents,
  scoutingObservations,
  tasks,
  traps,
  treatments,
} from "@/db/schema";
import { getTestDb, seedOrgScaffold, type TestDb } from "../helpers/test-db";

// Cross-organization isolation is the whole tenancy guarantee: every read a
// grower makes is scoped either by organizationId directly, or by a facility
// that belongs to their org. This proves that scoping predicate actually
// partitions the data for each entity named in the acceptance criteria --
// events, treatments, inventory, tasks, traps, facilities, scouting -- so a
// query written for one org can never surface another org's row.
let db: TestDb;

beforeAll(async () => {
  db = await getTestDb();
});

describe("cross-organization isolation", () => {
  it("partitions every org-owned entity between two organizations", async () => {
    const a = await seedOrgScaffold(db);
    const b = await seedOrgScaffold(db);
    const uid = () => randomUUID();

    // --- facilities: scoped by organizationId --------------------------------
    const aFacilities = await db.select().from(facilities).where(eq(facilities.organizationId, a.org.id));
    expect(aFacilities).toHaveLength(1);
    expect(aFacilities[0].id).toBe(a.facility.id);
    expect(aFacilities.some((f) => f.id === b.facility.id)).toBe(false);

    // --- inventory: scoped by organizationId ---------------------------------
    const [aItem] = await db
      .insert(inventoryItems)
      .values({ organizationId: a.org.id, category: "chemical", name: "A stock", unit: "L", quantity: 5 })
      .returning();
    await db
      .insert(inventoryItems)
      .values({ organizationId: b.org.id, category: "chemical", name: "B stock", unit: "L", quantity: 5 });
    const aInventory = await db.select().from(inventoryItems).where(eq(inventoryItems.organizationId, a.org.id));
    expect(aInventory.map((i) => i.id)).toEqual([aItem.id]);

    // --- tasks: scoped by organizationId -------------------------------------
    await db.insert(tasks).values({ organizationId: a.org.id, title: "A task", dueAt: new Date() });
    await db.insert(tasks).values({ organizationId: b.org.id, title: "B task", dueAt: new Date() });
    const aTasks = await db.select().from(tasks).where(eq(tasks.organizationId, a.org.id));
    expect(aTasks).toHaveLength(1);
    expect(aTasks[0].title).toBe("A task");

    // --- scouting: scoped by organizationId ----------------------------------
    await db.insert(scoutingObservations).values({
      organizationId: a.org.id,
      facilityAreaId: a.area.id,
      submittedByUserId: uid(),
      date: "2026-09-12",
    });
    await db.insert(scoutingObservations).values({
      organizationId: b.org.id,
      facilityAreaId: b.area.id,
      submittedByUserId: uid(),
      date: "2026-09-12",
    });
    const aScouting = await db
      .select()
      .from(scoutingObservations)
      .where(eq(scoutingObservations.organizationId, a.org.id));
    expect(aScouting).toHaveLength(1);
    expect(aScouting[0].facilityAreaId).toBe(a.area.id);

    // --- pest events: scoped by facility ownership ---------------------------
    const [aEvent] = await db
      .insert(pestEvents)
      .values({ facilityId: a.facility.id, pestSpecies: "spider mite" })
      .returning();
    await db.insert(pestEvents).values({ facilityId: b.facility.id, pestSpecies: "aphid" });
    const aEvents = await db.select().from(pestEvents).where(eq(pestEvents.facilityId, a.facility.id));
    expect(aEvents.map((e) => e.id)).toEqual([aEvent.id]);

    // --- treatments: scoped by facility ownership ----------------------------
    const [aTreatment] = await db
      .insert(treatments)
      .values({ facilityId: a.facility.id, type: "pesticide", product: "A product" })
      .returning();
    await db.insert(treatments).values({ facilityId: b.facility.id, type: "pesticide", product: "B product" });
    const aTreatments = await db.select().from(treatments).where(eq(treatments.facilityId, a.facility.id));
    expect(aTreatments.map((t) => t.id)).toEqual([aTreatment.id]);

    // --- traps: scoped by facility ownership ---------------------------------
    const [aTrap] = await db
      .insert(traps)
      .values({ facilityId: a.facility.id, facilityAreaId: a.area.id, x: 1, y: 1, label: "Trap 1" })
      .returning();
    await db.insert(traps).values({ facilityId: b.facility.id, facilityAreaId: b.area.id, x: 1, y: 1, label: "Trap 1" });
    const aTraps = await db.select().from(traps).where(eq(traps.facilityId, a.facility.id));
    expect(aTraps.map((t) => t.id)).toEqual([aTrap.id]);

    // A cross-org query built from org A's facility set never reaches B's rows.
    const bOnlyByAFacilities = await db
      .select()
      .from(treatments)
      .where(inArray(treatments.facilityId, aFacilities.map((f) => f.id)));
    expect(bOnlyByAFacilities.every((t) => t.facilityId === a.facility.id)).toBe(true);
  });
});
