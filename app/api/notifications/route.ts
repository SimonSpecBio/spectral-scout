import { NextResponse } from "next/server";
import { computeNotifications } from "@/lib/notifications";
import { requireGrowerSession } from "@/lib/session";

// Deliberately its own client-fetched endpoint, not folded into the shared
// app-wide layout's server render -- computeNotifications() derives from
// several tables per organization, and every /app/* page shares one
// layout, so running this on the server for every single navigation would
// add that cost to every page load just to light up a bell dot. Fetched
// once on mount by NotificationBell.tsx instead, off the critical render
// path.
export async function GET() {
  const session = await requireGrowerSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const notifications = await computeNotifications(session.organizationId!, session.user!.id!);
  return NextResponse.json(notifications.map((n) => ({ id: n.id, at: n.at.toISOString() })));
}
