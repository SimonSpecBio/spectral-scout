import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { areaKindEnum, facilityAreas, facilityMapObjects } from "@/db/schema";
import { getOwnedFacility } from "@/lib/facilities";
import { requireGrowerSession } from "@/lib/session";

// Same 900x600 canvas MapEditor.tsx uses -- a fresh area starts with a 2x2
// grid of default zones instead of a blank canvas, so there's something to
// rename/resize immediately rather than nothing at all.
const CANVAS_WIDTH = 900;
const CANVAS_HEIGHT = 600;
function defaultZones(areaId: string) {
  const margin = 20;
  const gap = 20;
  const w = (CANVAS_WIDTH - margin * 2 - gap) / 2;
  const h = (CANVAS_HEIGHT - margin * 2 - gap) / 2;
  const positions = [
    { x: margin, y: margin },
    { x: margin + w + gap, y: margin },
    { x: margin, y: margin + h + gap },
    { x: margin + w + gap, y: margin + h + gap },
  ];
  return positions.map((pos, i) => ({
    facilityAreaId: areaId,
    shapeType: "rect" as const,
    geometry: { x: pos.x, y: pos.y, width: w, height: h },
    label: `Zone ${i + 1}`,
    zIndex: 0,
  }));
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireGrowerSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const facility = await getOwnedFacility(id, session.organizationId!);
  if (!facility) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const rows = await db.select().from(facilityAreas).where(eq(facilityAreas.facilityId, id));
  return NextResponse.json(rows);
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireGrowerSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const facility = await getOwnedFacility(id, session.organizationId!);
  if (!facility) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await request.json();
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });
  const kind = areaKindEnum.enumValues.includes(body.kind) ? body.kind : "other";

  const [row] = await db
    .insert(facilityAreas)
    .values({
      facilityId: id,
      name,
      kind,
      cropType: typeof body.cropType === "string" && body.cropType ? body.cropType : null,
    })
    .returning();

  await db.insert(facilityMapObjects).values(defaultZones(row.id));

  return NextResponse.json(row);
}
