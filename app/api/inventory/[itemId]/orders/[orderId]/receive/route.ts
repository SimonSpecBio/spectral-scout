import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { inventoryItems, inventoryOrders } from "@/db/schema";
import { requireGrowerSession } from "@/lib/session";

// Marking an order received deletes the pending-order row and adds its
// quantity to the item's on-hand stock in one action -- see
// scout_inventory_order's schema comment on why these stay separate until
// this point (an order shouldn't inflate "in stock" before it arrives).
export async function POST(_request: Request, { params }: { params: Promise<{ itemId: string; orderId: string }> }) {
  const session = await requireGrowerSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { itemId, orderId } = await params;
  const [item] = await db
    .select()
    .from(inventoryItems)
    .where(and(eq(inventoryItems.id, itemId), eq(inventoryItems.organizationId, session.organizationId!)));
  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [order] = await db.select().from(inventoryOrders).where(and(eq(inventoryOrders.id, orderId), eq(inventoryOrders.itemId, itemId)));
  if (!order) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [row] = await db
    .update(inventoryItems)
    .set({ quantity: Number(item.quantity) + Number(order.quantity) })
    .where(eq(inventoryItems.id, itemId))
    .returning();
  await db.delete(inventoryOrders).where(eq(inventoryOrders.id, orderId));

  return NextResponse.json(row);
}
