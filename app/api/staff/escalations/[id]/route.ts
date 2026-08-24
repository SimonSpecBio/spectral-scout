import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { escalations } from "@/db/schema";
import { requireStaffSession } from "@/lib/session";

// Marks one escalation resolved with an optional response note. No re-check
// of the org's accountTier here on purpose: by the time an escalation row
// exists at all, the pilot-only gate already ran at creation
// (app/api/facilities/.../escalate); this route only ever mutates a row
// that's already real.
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireStaffSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const staffResponse = typeof body.staffResponse === "string" && body.staffResponse.trim() ? body.staffResponse.trim() : null;

  const [row] = await db
    .update(escalations)
    .set({ resolvedAt: new Date(), resolvedByStaffId: session.user!.id!, staffResponse })
    .where(eq(escalations.id, id))
    .returning();
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(row);
}
