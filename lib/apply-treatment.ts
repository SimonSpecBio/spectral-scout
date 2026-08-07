import { eq } from "drizzle-orm";
import { db } from "@/db";
import { inventoryItems, treatments } from "@/db/schema";

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

  return row;
}
