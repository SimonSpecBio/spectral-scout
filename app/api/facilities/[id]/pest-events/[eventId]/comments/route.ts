import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { pestEventComments } from "@/db/schema";
import { users as authUsers } from "@/db/auth-schema";
import { getOwnedPestEvent } from "@/lib/pest-events";
import { requireGrowerSession } from "@/lib/session";

// Same auth pattern as the existing photos route on this event. GET
// returns oldest-first (a chat thread reads top-to-bottom), joined against
// the author's name/email for display -- a comment with no author
// (authorUserId null) is the one-time-migrated legacy `notes` value, shown
// as an unattributed system entry rather than a fabricated author.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string; eventId: string }> }) {
  const session = await requireGrowerSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, eventId } = await params;
  const event = await getOwnedPestEvent(id, eventId, session.organizationId!);
  if (!event) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const rows = await db
    .select({
      id: pestEventComments.id,
      body: pestEventComments.body,
      createdAt: pestEventComments.createdAt,
      authorUserId: pestEventComments.authorUserId,
      authorName: authUsers.name,
      authorEmail: authUsers.email,
    })
    .from(pestEventComments)
    .leftJoin(authUsers, eq(pestEventComments.authorUserId, authUsers.id))
    .where(eq(pestEventComments.pestEventId, eventId))
    .orderBy(pestEventComments.createdAt);
  return NextResponse.json(rows);
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string; eventId: string }> }) {
  const session = await requireGrowerSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, eventId } = await params;
  const event = await getOwnedPestEvent(id, eventId, session.organizationId!);
  if (!event) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await request.json();
  const text = typeof body.body === "string" ? body.body.trim() : "";
  if (!text) return NextResponse.json({ error: "body is required" }, { status: 400 });

  const [row] = await db
    .insert(pestEventComments)
    .values({ pestEventId: eventId, authorUserId: session.user!.id!, body: text })
    .returning();
  return NextResponse.json({
    ...row,
    authorName: session.user?.name ?? null,
    authorEmail: session.user?.email ?? "",
  });
}
