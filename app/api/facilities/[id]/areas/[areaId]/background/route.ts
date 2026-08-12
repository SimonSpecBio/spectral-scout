import { and, eq } from "drizzle-orm";
import { put } from "@vercel/blob";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { facilityAreas } from "@/db/schema";
import { getOwnedFacility } from "@/lib/facilities";
import { requireGrowerSession } from "@/lib/session";
import { safeFileName, validateImageUpload } from "@/lib/validate-upload";

// Uploads a blueprint photo (or, later, a satellite snapshot fetched by
// address) as the area's background reference image -- same mechanism
// either way, the grower traces over it with the map object tools instead
// of drawing a layout from a blank canvas. Requires BLOB_READ_WRITE_TOKEN
// (see README/.env.example).
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string; areaId: string }> }) {
  const session = await requireGrowerSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, areaId } = await params;
  const facility = await getOwnedFacility(id, session.organizationId!);
  if (!facility) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const [area] = await db
    .select()
    .from(facilityAreas)
    .where(and(eq(facilityAreas.id, areaId), eq(facilityAreas.facilityId, id)));
  if (!area) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "file is required" }, { status: 400 });
  const uploadError = validateImageUpload(file);
  if (uploadError) return NextResponse.json({ error: uploadError }, { status: 400 });

  const blob = await put(`facility-areas/${areaId}/background-${Date.now()}-${safeFileName(file.name)}`, file, {
    access: "public",
  });

  const [row] = await db
    .update(facilityAreas)
    .set({ backgroundImageUrl: blob.url, updatedAt: new Date() })
    .where(eq(facilityAreas.id, areaId))
    .returning();
  return NextResponse.json(row);
}
