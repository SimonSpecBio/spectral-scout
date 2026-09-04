import { and, eq } from "drizzle-orm";
import { put } from "@vercel/blob";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { facilityAreas } from "@/db/schema";
import { isDemoSession } from "@/lib/demo-account";
import { getOwnedFacility } from "@/lib/facilities";
import { requireGrowerSession } from "@/lib/session";
import { safeFileName, stripImageMetadata, validateImageUpload } from "@/lib/validate-upload";

// Uploads a blueprint photo (or, later, a satellite snapshot fetched by
// address) as the area's background reference image -- same mechanism
// either way, the grower traces over it with the map object tools instead
// of drawing a layout from a blank canvas. Requires BLOB_READ_WRITE_TOKEN
// (see README/.env.example).
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string; areaId: string }> }) {
  const session = await requireGrowerSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (isDemoSession(session)) return NextResponse.json({ error: "Photo uploads are disabled on the shared demo account" }, { status: 403 });

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

  const stripped = await stripImageMetadata(Buffer.from(await file.arrayBuffer()), file.type);
  const blob = await put(`facility-areas/${areaId}/background-${Date.now()}-${safeFileName(file.name)}`, stripped, {
    access: "public",
    contentType: file.type,
  });

  await db.update(facilityAreas).set({ backgroundImageUrl: blob.url, updatedAt: new Date() }).where(eq(facilityAreas.id, areaId));
  // Neither caller (MapEditor's own upload button, LayoutPicker's Tier-2
  // option) reads the response body, only res.ok -- returning the full
  // updated row was throwing "Value is not JSON serializable" in dev for
  // reasons unrelated to the actual row content (the DB write itself always
  // succeeded), so this returns the minimum both callers actually need.
  return NextResponse.json({ backgroundImageUrl: blob.url });
}
