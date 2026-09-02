import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { memberships, shareNotifications } from "@/db/schema";
import { getOwnedPestEvent } from "@/lib/pest-events";
import { requireGrowerSession } from "@/lib/session";

// Replaces the external share-link's POST/DELETE (Airtable ticket B5) --
// team-only, no token/expiry concept needed since a notification is a
// one-off "look at this," not standing access. Any org member can share
// (not owner-gated), same permission model the old share-link had.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string; eventId: string }> }) {
  const session = await requireGrowerSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, eventId } = await params;
  const event = await getOwnedPestEvent(id, eventId, session.organizationId!);
  if (!event) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await request.json();
  const toUserIds: string[] = Array.isArray(body.toUserIds) ? body.toUserIds.filter((v: unknown) => typeof v === "string") : [];
  if (toUserIds.length === 0) return NextResponse.json({ error: "toUserIds required" }, { status: 400 });

  // Verifies every recipient actually belongs to this org before inserting
  // -- a client-supplied user id is only ever type-checked above, and a
  // crafted id from outside the org would otherwise let one organization's
  // member silently notify an unrelated account (same "verify before
  // trusting" rule lib/apply-treatment.ts's inventoryItemId check follows).
  const orgMembers = await db.select({ userId: memberships.userId }).from(memberships).where(eq(memberships.organizationId, session.organizationId!));
  const orgMemberIds = new Set(orgMembers.map((m) => m.userId));
  const validToUserIds = [...new Set(toUserIds)].filter((uid) => orgMemberIds.has(uid) && uid !== session.user?.id);
  if (validToUserIds.length === 0) return NextResponse.json({ error: "No valid recipients" }, { status: 400 });

  const rows = await db
    .insert(shareNotifications)
    .values(
      validToUserIds.map((toUserId) => ({
        organizationId: session.organizationId!,
        pestEventId: eventId,
        fromUserId: session.user!.id!,
        toUserId,
      }))
    )
    .returning();
  return NextResponse.json(rows);
}
