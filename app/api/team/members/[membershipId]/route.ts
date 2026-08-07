import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { memberships } from "@/db/schema";
import { requireGrowerSession } from "@/lib/session";

// Removes a team member. Owner-only, and guards the last owner -- without
// this an owner could remove themselves (or the only other owner) and
// leave the org with no one able to invite/remove/reassign, a dead end
// with no recovery path short of a manual DB fix.
export async function DELETE(_request: Request, { params }: { params: Promise<{ membershipId: string }> }) {
  const session = await requireGrowerSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.membershipRole !== "owner") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { membershipId } = await params;
  const [target] = await db
    .select()
    .from(memberships)
    .where(and(eq(memberships.id, membershipId), eq(memberships.organizationId, session.organizationId!)));
  if (!target) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (target.role === "owner") {
    const owners = await db
      .select()
      .from(memberships)
      .where(and(eq(memberships.organizationId, session.organizationId!), eq(memberships.role, "owner")));
    if (owners.length <= 1) {
      return NextResponse.json({ error: "Can't remove the last owner" }, { status: 400 });
    }
  }

  await db.delete(memberships).where(eq(memberships.id, membershipId));
  return NextResponse.json({ ok: true });
}
