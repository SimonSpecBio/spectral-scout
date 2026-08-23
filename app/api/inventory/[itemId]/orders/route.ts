import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { inventoryItems, inventoryOrders } from "@/db/schema";
import { requireGrowerSession } from "@/lib/session";

export async function POST(request: NextRequest, { params }: { params: Promise<{ itemId: string }> }) {
  const session = await requireGrowerSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { itemId } = await params;
  const [item] = await db
    .select()
    .from(inventoryItems)
    .where(and(eq(inventoryItems.id, itemId), eq(inventoryItems.organizationId, session.organizationId!)));
  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await request.json();
  const quantity = typeof body.quantity === "number" && body.quantity > 0 ? body.quantity : null;
  if (!quantity) return NextResponse.json({ error: "quantity is required" }, { status: 400 });

  const unitCost = typeof body.unitCost === "number" && body.unitCost >= 0 ? body.unitCost : null;
  // A grower may only know the total from a bulk invoice, not a clean
  // per-unit price -- accept either and derive the other when possible
  // rather than forcing both fields.
  const totalCost = typeof body.totalCost === "number" && body.totalCost >= 0 ? body.totalCost : unitCost != null ? unitCost * quantity : null;

  const [row] = await db
    .insert(inventoryOrders)
    .values({
      itemId,
      quantity,
      supplier: typeof body.supplier === "string" && body.supplier ? body.supplier : null,
      supplierContact: typeof body.supplierContact === "string" && body.supplierContact ? body.supplierContact : null,
      unitCost,
      totalCost,
      expectedAt: typeof body.expectedAt === "string" && body.expectedAt ? body.expectedAt : null,
    })
    .returning();
  return NextResponse.json(row);
}
