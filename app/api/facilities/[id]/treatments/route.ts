import { NextRequest, NextResponse } from "next/server";
import { treatmentTypeEnum } from "@/db/schema";
import { insertTreatmentAndDecrementStock } from "@/lib/apply-treatment";
import { getOwnedFacility } from "@/lib/facilities";
import { requireGrowerSession } from "@/lib/session";

// Standalone "Application log" -- no pestEventId, e.g. a routine biocontrol
// release with no infestation behind it. Needs its own x/y (see
// db/schema.ts's comment on treatments.x/y) since there's no parent event
// to inherit a location from.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireGrowerSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const facility = await getOwnedFacility(id, session.organizationId!);
  if (!facility) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await request.json();
  if (!treatmentTypeEnum.enumValues.includes(body.type)) {
    return NextResponse.json({ error: "invalid type" }, { status: 400 });
  }
  const x = typeof body.x === "number" ? body.x : null;
  const y = typeof body.y === "number" ? body.y : null;
  if (x == null || y == null) return NextResponse.json({ error: "x and y are required" }, { status: 400 });

  const row = await insertTreatmentAndDecrementStock(session.organizationId!, {
    facilityId: id,
    pestEventId: null,
    x,
    y,
    type: body.type,
    product: typeof body.product === "string" && body.product ? body.product : null,
    targetPest: typeof body.targetPest === "string" && body.targetPest ? body.targetPest : null,
    inventoryItemId: typeof body.inventoryItemId === "string" ? body.inventoryItemId : null,
    quantityUsed: typeof body.quantityUsed === "number" ? body.quantityUsed : null,
    operatorUserId: session.user?.id ?? null,
    notes: typeof body.notes === "string" && body.notes ? body.notes : null,
    minutesSpent: typeof body.minutesSpent === "number" ? body.minutesSpent : null,
  });
  return NextResponse.json(row);
}
