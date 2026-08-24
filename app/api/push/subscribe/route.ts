import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { pushSubscriptions } from "@/db/schema";
import { requireGrowerSession } from "@/lib/session";

// One row per device, keyed on the push service's own endpoint URL (see
// db/schema.ts's comment) -- upsert-by-endpoint rather than insert, so
// re-enabling notifications on the same browser doesn't pile up duplicates.
export async function POST(request: NextRequest) {
  const session = await requireGrowerSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const endpoint = typeof body.endpoint === "string" ? body.endpoint : null;
  const p256dh = typeof body.keys?.p256dh === "string" ? body.keys.p256dh : null;
  const auth = typeof body.keys?.auth === "string" ? body.keys.auth : null;
  if (!endpoint || !p256dh || !auth) return NextResponse.json({ error: "endpoint and keys.p256dh/keys.auth are required" }, { status: 400 });

  await db
    .insert(pushSubscriptions)
    .values({ userId: session.user!.id!, endpoint, p256dh, auth })
    .onConflictDoUpdate({ target: pushSubscriptions.endpoint, set: { userId: session.user!.id!, p256dh, auth } });
  return NextResponse.json({ ok: true });
}

// Unsubscribing (permission revoked, or the user toggled it off) removes
// this device's row outright -- there's no "disabled but remembered" state,
// since re-enabling just re-subscribes and upserts fresh. Scoped to the
// caller's own userId (ticket 100 -- this previously deleted by endpoint
// alone with no ownership check at all).
export async function DELETE(request: NextRequest) {
  const session = await requireGrowerSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const endpoint = typeof body.endpoint === "string" ? body.endpoint : null;
  if (!endpoint) return NextResponse.json({ error: "endpoint is required" }, { status: 400 });

  await db.delete(pushSubscriptions).where(and(eq(pushSubscriptions.endpoint, endpoint), eq(pushSubscriptions.userId, session.user!.id!)));
  return NextResponse.json({ ok: true });
}
