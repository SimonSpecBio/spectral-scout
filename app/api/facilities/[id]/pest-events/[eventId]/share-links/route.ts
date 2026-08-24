import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { shareLinks } from "@/db/schema";
import { getOwnedPestEvent } from "@/lib/pest-events";
import { requireGrowerSession } from "@/lib/session";
import { generateShareToken, SHARE_LINK_TTL_DAYS } from "@/lib/share-links";

const DAY_MS = 86_400_000;

// Creates a fresh, scoped read-only link for this event -- any org member
// can share (not owner-gated, unlike destructive/org-identity actions),
// since this is about looping in a consultant, not changing anything.
export async function POST(_request: Request, { params }: { params: Promise<{ id: string; eventId: string }> }) {
  const session = await requireGrowerSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, eventId } = await params;
  const event = await getOwnedPestEvent(id, eventId, session.organizationId!);
  if (!event) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [row] = await db
    .insert(shareLinks)
    .values({
      organizationId: session.organizationId!,
      token: generateShareToken(),
      pestEventId: eventId,
      createdByUserId: session.user?.id ?? null,
      expiresAt: new Date(Date.now() + SHARE_LINK_TTL_DAYS * DAY_MS),
    })
    .returning();
  return NextResponse.json(row);
}

// Revokes every still-active share link for this event -- v1 doesn't track
// or list individual links back to the grower, so "revoke" clears the
// whole event rather than needing a specific link id.
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string; eventId: string }> }) {
  const session = await requireGrowerSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, eventId } = await params;
  const event = await getOwnedPestEvent(id, eventId, session.organizationId!);
  if (!event) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await db
    .update(shareLinks)
    .set({ revokedAt: new Date() })
    .where(and(eq(shareLinks.pestEventId, eventId), eq(shareLinks.organizationId, session.organizationId!)));
  return NextResponse.json({ ok: true });
}
