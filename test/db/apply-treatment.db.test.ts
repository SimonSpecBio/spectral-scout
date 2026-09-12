// @vitest-environment node
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it, vi } from "vitest";

// Route the app's `db` singleton at the in-memory pglite database. The
// factory is async because the migrated database is built once and awaited;
// vitest hoists vi.mock above the imports below, so apply-treatment.ts binds
// to this db when it is first imported.
vi.mock("@/db", async () => {
  const { getTestDb } = await import("../helpers/test-db");
  return { db: await getTestDb() };
});

import { insertTreatmentAndDecrementStock } from "@/lib/apply-treatment";
import { establishmentChecks, tasks, treatments, inventoryItems } from "@/db/schema";
import { getTestDb, seedInventoryItem, seedOrgScaffold, type TestDb } from "../helpers/test-db";

let db: TestDb;

beforeAll(async () => {
  db = await getTestDb();
});

describe("insertTreatmentAndDecrementStock", () => {
  it("commits the treatment and decrements stock together", async () => {
    const { org, facility } = await seedOrgScaffold(db);
    const item = await seedInventoryItem(db, org.id, { category: "chemical", quantity: 10 });

    const row = await insertTreatmentAndDecrementStock(org.id, {
      facilityId: facility.id,
      type: "pesticide",
      product: "Test miticide",
      inventoryItemId: item.id,
      quantityUsed: 3,
    });

    expect(row.id).toBeTruthy();
    expect(row.stockWentNegative).toBe(false);

    const [treatmentRow] = await db.select().from(treatments).where(eq(treatments.id, row.id));
    expect(treatmentRow.inventoryItemId).toBe(item.id);

    const [after] = await db.select().from(inventoryItems).where(eq(inventoryItems.id, item.id));
    expect(after.quantity).toBe(7);
  });

  it("floors stock at 0 and persists stockWentNegative when usage exceeds recorded stock", async () => {
    const { org, facility } = await seedOrgScaffold(db);
    const item = await seedInventoryItem(db, org.id, { category: "chemical", quantity: 2 });

    const row = await insertTreatmentAndDecrementStock(org.id, {
      facilityId: facility.id,
      type: "pesticide",
      product: "Overused product",
      inventoryItemId: item.id,
      quantityUsed: 5,
    });

    // The spray physically happened, so the row must exist regardless of the
    // bookkeeping shortfall -- and the discrepancy must be recorded, not just
    // returned and then lost.
    expect(row.stockWentNegative).toBe(true);
    const [after] = await db.select().from(inventoryItems).where(eq(inventoryItems.id, item.id));
    expect(after.quantity).toBe(0);
    const [persisted] = await db.select().from(treatments).where(eq(treatments.id, row.id));
    expect(persisted.stockWentNegative).toBe(true);
  });

  it("is idempotent on a replayed clientRequestId: one row, one decrement", async () => {
    const { org, facility } = await seedOrgScaffold(db);
    const item = await seedInventoryItem(db, org.id, { category: "chemical", quantity: 10 });
    const clientRequestId = `replay-${crypto.randomUUID()}`;

    const values = {
      facilityId: facility.id,
      type: "pesticide" as const,
      product: "Replayed product",
      inventoryItemId: item.id,
      quantityUsed: 4,
      clientRequestId,
    };

    const first = await insertTreatmentAndDecrementStock(org.id, values);
    const second = await insertTreatmentAndDecrementStock(org.id, values);

    // Same logical capture replayed (timeout-then-retry, or two devices
    // flushing the same queued item) must resolve to the same row.
    expect(second.id).toBe(first.id);

    const rows = await db.select().from(treatments).where(eq(treatments.clientRequestId, clientRequestId));
    expect(rows).toHaveLength(1);

    // Critically, stock is decremented once (10 - 4), not twice -- the
    // costliest instance of the double-apply bug this guards against.
    const [after] = await db.select().from(inventoryItems).where(eq(inventoryItems.id, item.id));
    expect(after.quantity).toBe(6);
  });

  it("refuses to decrement another organization's inventory item", async () => {
    const orgA = await seedOrgScaffold(db);
    const orgB = await seedOrgScaffold(db);
    const victimItem = await seedInventoryItem(db, orgB.org.id, { category: "chemical", quantity: 20 });

    // orgA submits a treatment naming orgB's inventory id (a crafted or buggy
    // client id). The unowned id is dropped, the treatment still logs, and
    // orgB's stock is untouched.
    const row = await insertTreatmentAndDecrementStock(orgA.org.id, {
      facilityId: orgA.facility.id,
      type: "pesticide",
      product: "Cross-org attempt",
      inventoryItemId: victimItem.id,
      quantityUsed: 5,
    });

    expect(row.inventoryItemId).toBeNull();
    const [after] = await db.select().from(inventoryItems).where(eq(inventoryItems.id, victimItem.id));
    expect(after.quantity).toBe(20);
  });

  it("auto-creates an establishment-check follow-up for a biological treatment", async () => {
    const { org, facility } = await seedOrgScaffold(db);

    const row = await insertTreatmentAndDecrementStock(org.id, {
      facilityId: facility.id,
      type: "biological",
      product: "Amblyseius swirskii",
    });

    const checks = await db.select().from(establishmentChecks).where(eq(establishmentChecks.treatmentId, row.id));
    expect(checks).toHaveLength(1);
    expect(checks[0].organizationId).toBe(org.id);
    expect(checks[0].agentName).toBe("Amblyseius swirskii");

    const [followUpTask] = await db.select().from(tasks).where(eq(tasks.id, checks[0].taskId));
    expect(followUpTask.type).toBe("establishment_check");
    expect(followUpTask.organizationId).toBe(org.id);
  });
});
