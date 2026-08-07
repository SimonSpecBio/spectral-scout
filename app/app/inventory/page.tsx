import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { inventoryItems, inventoryOrders } from "@/db/schema";
import { requireGrowerSession } from "@/lib/session";
import InventoryClient from "./InventoryClient";

export const dynamic = "force-dynamic";

export default async function InventoryPage() {
  const session = await requireGrowerSession();
  if (!session) return null;

  const items = await db.select().from(inventoryItems).where(eq(inventoryItems.organizationId, session.organizationId!));
  const itemIds = items.map((i) => i.id);
  const orders = itemIds.length ? await db.select().from(inventoryOrders).where(inArray(inventoryOrders.itemId, itemIds)) : [];

  return (
    <div className="mx-auto flex max-w-md flex-col gap-6">
      <h1 className="text-2xl font-semibold">Inventory</h1>
      <InventoryClient
        initialItems={items.map((i) => ({
          ...i,
          quantity: Number(i.quantity),
          reorderLevel: i.reorderLevel == null ? null : Number(i.reorderLevel),
          createdAt: i.createdAt.toISOString(),
        }))}
        initialOrders={orders.map((o) => ({ ...o, quantity: Number(o.quantity), createdAt: o.createdAt.toISOString() }))}
      />
    </div>
  );
}
