import { desc, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { escalations } from "@/db/schema";
import { getOwnedPestEvent } from "@/lib/pest-events";
import { requireGrowerSession } from "@/lib/session";

// Most recent escalation for this event, if any -- lets PestEventDetail
// show "Flagged for review" / the staff response without threading extra
// props through the server page for what's otherwise a client-only action.
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string; eventId: string }> }) {
  const session = await requireGrowerSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, eventId } = await params;
  const event = await getOwnedPestEvent(id, eventId, session.organizationId!);
  if (!event) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [row] = await db.select().from(escalations).where(eq(escalations.pestEventId, eventId)).orderBy(desc(escalations.createdAt));
  return NextResponse.json({ escalation: row ?? null });
}

// "Ask a person" (ticket 96) -- PILOT-TIER ONLY. See db/schema.ts's
// scout_escalation comment for why: lib/consent.ts's free-tier promise is
// an absolute "staff-facing screens never surface your organization-
// identifiable data," and this feature necessarily does exactly that for
// whichever event gets flagged. Any org member can flag (not owner-gated),
// same as share-links -- asking for help isn't a destructive/identity
// action.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string; eventId: string }> }) {
  const session = await requireGrowerSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.accountTier !== "pilot") {
    return NextResponse.json({ error: "Human review is available on pilot accounts. Contact Spectral to learn more." }, { status: 403 });
  }

  const { id, eventId } = await params;
  const event = await getOwnedPestEvent(id, eventId, session.organizationId!);
  if (!event) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  const note = typeof body.note === "string" && body.note.trim() ? body.note.trim() : null;

  const [row] = await db
    .insert(escalations)
    .values({ organizationId: session.organizationId!, pestEventId: eventId, requestedByUserId: session.user!.id!, note })
    .returning();
  return NextResponse.json(row);
}
