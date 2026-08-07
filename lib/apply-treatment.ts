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
export async function insertTreatmentAndDecrementStock(values: typeof treatments.$inferInsert) {
  const [row] = await db.insert(treatments).values(values).returning();

  if (values.inventoryItemId && values.quantityUsed) {
    const [item] = await db.select().from(inventoryItems).where(eq(inventoryItems.id, values.inventoryItemId));
    if (item) {
      await db
        .update(inventoryItems)
        .set({ quantity: Math.max(0, Number(item.quantity) - Number(values.quantityUsed)) })
        .where(eq(inventoryItems.id, values.inventoryItemId));
    }
  }

  return row;
}
