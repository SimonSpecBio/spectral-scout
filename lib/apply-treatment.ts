import { eq } from "drizzle-orm";
import { db } from "@/db";
import { establishmentChecks, inventoryItems, tasks, treatments } from "@/db/schema";

const DAY_MS = 86_400_000;
// A week is the common IPM middle-ground for a first establishment read --
// long enough for a released predator/parasitoid to start visibly working
// (or not), short enough that a real failure is still catchable before the
// pest rebounds hard. Not sourced to one specific citation; a reasonable
// default rather than a fabricated precise number.
const ESTABLISHMENT_CHECK_DAYS = 7;

// Shared by both treatment-creation routes (event-scoped and standalone
// "Application log") so the inventory-decrement side effect only lives in
// one place. Per ARCHITECTURE.md's trigger rules: "Treatment logged ->
// decrement InventoryItem." Low-stock notification is handled by whatever
// screen reads inventoryItems.quantity vs reorderLevel at render time (the
// Inventory screen's LOW STOCK badge) rather than a separate event here --
// there's no notification feed to push into yet.
//
// organizationId is required (not inferred from the row) specifically so
// values.inventoryItemId -- client-supplied, only type-checked by the
// caller -- gets verified to actually belong to that org before it's
// trusted for anything. Without this, a crafted inventoryItemId from a
// different org would let one organization silently decrement another's
// stock. An unowned id has its link dropped rather than failing the whole
// request -- treated as "not from inventory" instead of punishing a
// legitimate submission for what's only ever a malicious/buggy client id.
export async function insertTreatmentAndDecrementStock(organizationId: string, values: typeof treatments.$inferInsert) {
  let inventoryItemId = values.inventoryItemId ?? null;
  let item: typeof inventoryItems.$inferSelect | undefined;
  if (inventoryItemId) {
    [item] = await db.select().from(inventoryItems).where(eq(inventoryItems.id, inventoryItemId));
    if (!item || item.organizationId !== organizationId) {
      inventoryItemId = null;
      item = undefined;
    }
  }

  const [row] = await db.insert(treatments).values({ ...values, inventoryItemId }).returning();

  if (item && inventoryItemId && values.quantityUsed) {
    await db
      .update(inventoryItems)
      .set({ quantity: Math.max(0, Number(item.quantity) - Number(values.quantityUsed)) })
      .where(eq(inventoryItems.id, inventoryItemId));
  }

  // Silent release failure is a real, common way growers lose money without
  // realizing it -- prompt a check-in instead of only ever tracking pest
  // counts (FUTURE_FEATURES_THEORIZING.md #4). Every biological treatment
  // gets one, whether logged via the recommendation engine's Apply button
  // or a manual Application log entry, since both funnel through here.
  if (row.type === "biological" && row.product) {
    const [task] = await db
      .insert(tasks)
      .values({
        organizationId,
        title: `Check ${row.product} establishment`,
        type: "establishment_check",
        facilityId: row.facilityId,
        pestEventId: row.pestEventId,
        x: row.x,
        y: row.y,
        dueAt: new Date(row.appliedAt.getTime() + ESTABLISHMENT_CHECK_DAYS * DAY_MS),
      })
      .returning();
    await db.insert(establishmentChecks).values({
      organizationId,
      taskId: task.id,
      treatmentId: row.id,
      agentName: row.product,
    });
  }

  return row;
}
