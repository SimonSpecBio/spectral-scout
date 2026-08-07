import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { inventoryItems } from "@/db/schema";
import { requireGrowerSession } from "@/lib/session";

// Restock (add to quantity) or edit reorderLevel -- a manual "I bought more
// on my own, add it directly" path, separate from the orders/receive flow
// which tracks supplier/ETA before it arrives.
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ itemId: string }> }) {
  const session = await requireGrowerSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { itemId } = await params;
  const [item] = await db
    .select()
    .from(inventoryItems)
    .where(and(eq(inventoryItems.id, itemId), eq(inventoryItems.organizationId, session.organizationId!)));
  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await request.json();
  const updates: Partial<typeof inventoryItems.$inferInsert> = {};
  if (typeof body.addQuantity === "number") updates.quantity = Number(item.quantity) + body.addQuantity;
  if (typeof body.reorderLevel === "number" || body.reorderLevel === null) updates.reorderLevel = body.reorderLevel;

  const [row] = await db.update(inventoryItems).set(updates).where(eq(inventoryItems.id, itemId)).returning();
  return NextResponse.json(row);
}
