import { eq } from "drizzle-orm";
import { put } from "@vercel/blob";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { observationPhotos } from "@/db/schema";
import { isDemoSession } from "@/lib/demo-account";
import { getOwnedPestEvent } from "@/lib/pest-events";
import { requireGrowerSession } from "@/lib/session";
import { safeFileName, stripImageMetadata, validateImageUpload } from "@/lib/validate-upload";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string; eventId: string }> }) {
  const session = await requireGrowerSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, eventId } = await params;
  const event = await getOwnedPestEvent(id, eventId, session.organizationId!);
  if (!event) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const rows = await db.select().from(observationPhotos).where(eq(observationPhotos.pestEventId, eventId));
  return NextResponse.json(rows);
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string; eventId: string }> }) {
  const session = await requireGrowerSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (isDemoSession(session)) return NextResponse.json({ error: "Photo uploads are disabled on the shared demo account" }, { status: 403 });

  const { id, eventId } = await params;
  const event = await getOwnedPestEvent(id, eventId, session.organizationId!);
  if (!event) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "file is required" }, { status: 400 });
  const uploadError = validateImageUpload(file);
  if (uploadError) return NextResponse.json({ error: uploadError }, { status: 400 });

  const captionRaw = form.get("caption");
  const caption = typeof captionRaw === "string" && captionRaw.trim() ? captionRaw.trim() : null;

  const stripped = await stripImageMetadata(Buffer.from(await file.arrayBuffer()), file.type);
  const blob = await put(`pest-events/${eventId}/${Date.now()}-${safeFileName(file.name)}`, stripped, {
    access: "public",
    contentType: file.type,
  });

  const [row] = await db
    .insert(observationPhotos)
    .values({ pestEventId: eventId, blobUrl: blob.url, caption, uploadedByUserId: session.user!.id! })
    .returning();
  return NextResponse.json(row);
}
