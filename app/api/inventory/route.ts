import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { inventoryCategoryEnum, inventoryItems } from "@/db/schema";
import { requireGrowerSession } from "@/lib/session";

export async function GET() {
  const session = await requireGrowerSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rows = await db.select().from(inventoryItems).where(eq(inventoryItems.organizationId, session.organizationId!));
  return NextResponse.json(rows);
}

// Add from catalog (fields pre-filled from lib/inventory-catalog.ts) or a
// fully custom item -- same endpoint either way, the client just sends
// whatever fields it has.
export async function POST(request: NextRequest) {
  const session = await requireGrowerSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });
  if (!inventoryCategoryEnum.enumValues.includes(body.category)) {
    return NextResponse.json({ error: "invalid category" }, { status: 400 });
  }
  const unit = typeof body.unit === "string" && body.unit.trim() ? body.unit.trim() : "units";
  const quantity = typeof body.quantity === "number" && body.quantity >= 0 ? body.quantity : 0;

  // A negative or wildly-out-of-range value here isn't just bad data --
  // lib/rei-phi.ts's LOOKBACK_DAYS window and reiEndsAt/phiEndsAt math both
  // assume a sane positive interval (ticket recdC9gknN5CHcBE4: an unvalidated
  // phiDays north of 30 used to fall out of that window entirely and read
  // as harvest-clear while real days remained). Rejected outright rather
  // than silently clamped -- clamping a badly-mistyped value to the
  // boundary would still show a real-looking-but-wrong number.
  if (typeof body.reiHours === "number" && (!Number.isFinite(body.reiHours) || body.reiHours < 0 || body.reiHours > 8760)) {
    return NextResponse.json({ error: "reiHours must be between 0 and 8760 (one year)" }, { status: 400 });
  }
  if (typeof body.phiDays === "number" && (!Number.isFinite(body.phiDays) || body.phiDays < 0 || body.phiDays > 365)) {
    return NextResponse.json({ error: "phiDays must be between 0 and 365" }, { status: 400 });
  }

  const [row] = await db
    .insert(inventoryItems)
    .values({
      organizationId: session.organizationId!,
      category: body.category,
      name,
      scientificName: typeof body.scientificName === "string" && body.scientificName ? body.scientificName : null,
      unit,
      quantity,
      reorderLevel: typeof body.reorderLevel === "number" ? body.reorderLevel : null,
      reiHours: typeof body.reiHours === "number" ? body.reiHours : null,
      phiDays: typeof body.phiDays === "number" ? body.phiDays : null,
      cautions: typeof body.cautions === "string" && body.cautions ? body.cautions : null,
      unitCost: typeof body.unitCost === "number" && body.unitCost >= 0 ? body.unitCost : null,
    })
    .returning();
  return NextResponse.json(row);
}
