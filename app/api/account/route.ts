import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/auth-schema";
import { memberships, organizations } from "@/db/schema";
import { isDemoSession } from "@/lib/demo-account";
import { requireGrowerSession } from "@/lib/session";

// Self-serve account deletion (CCPA/CPRA right to delete, and the GDPR
// equivalent). Being authenticated already satisfies CCPA's identity-
// verification requirement for a request against your own account ("if a
// consumer maintains a password-protected account, the business may verify
// through its existing authentication practices") -- no separate ID-check
// step needed, which is what makes an immediate self-serve delete
// (vs. a queued/reviewed request) the correct, fully-compliant design here.
//
// Scoping mirrors the exact same "last owner" guard
// app/api/team/members/[membershipId]/route.ts already enforces for
// removing a teammate, since deleting your own account IS removing a
// teammate (yourself) -- just applied to the caller instead of a target id:
//   - member (not owner): delete just this user's own account+membership.
//     The org and everyone else's data are unaffected.
//   - owner, and at least one other owner exists: same as above -- the org
//     keeps running under the remaining owner(s).
//   - owner, no other memberships of ANY role exist: this is a solo
//     account -- delete the entire organization (cascades to every table
//     via the existing onDelete: cascade chains in db/schema.ts) along with
//     the user.
//   - owner, sole owner, but other non-owner members still exist: blocked,
//     same reasoning as the teammate-removal guard -- deleting would leave
//     the org with people in it but no one able to manage/invite/remove.
//     Promote another member to owner (or remove them) first.
export async function DELETE() {
  const session = await requireGrowerSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (isDemoSession(session)) return NextResponse.json({ error: "Account deletion is disabled on the shared demo account" }, { status: 403 });

  const userId = session.user!.id!;
  const orgId = session.organizationId!;

  if (session.membershipRole === "owner") {
    const orgMemberships = await db.select().from(memberships).where(eq(memberships.organizationId, orgId));
    const otherMemberships = orgMemberships.filter((m) => m.userId !== userId);
    const otherOwners = otherMemberships.filter((m) => m.role === "owner");

    if (otherMemberships.length === 0) {
      // Solo account -- delete the whole organization, cascades everywhere.
      await db.delete(organizations).where(eq(organizations.id, orgId));
      await db.delete(users).where(eq(users.id, userId));
      return NextResponse.json({ ok: true, deletedOrganization: true });
    }

    if (otherOwners.length === 0) {
      return NextResponse.json(
        { error: "You're the only owner and other teammates still have access. Promote another owner or remove the rest of the team before deleting your account." },
        { status: 400 }
      );
    }
  }

  // Member, or an owner with another owner still in place: remove just this
  // person -- deleting the user row cascades their sessions/accounts
  // (db/auth-schema.ts), and the membership row is matched-by-value, not a
  // real FK, so it's deleted explicitly here.
  await db.delete(memberships).where(and(eq(memberships.userId, userId), eq(memberships.organizationId, orgId)));
  await db.delete(users).where(eq(users.id, userId));
  return NextResponse.json({ ok: true, deletedOrganization: false });
}
