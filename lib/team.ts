import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/auth-schema";
import { invites, memberships } from "@/db/schema";

export interface TeamMember {
  membershipId: string;
  userId: string;
  name: string | null;
  email: string;
  role: "owner" | "member";
  createdAt: Date;
}

// Members + pending invites for the "TEAM" section (assignee picker,
// screen 17) and the /app/team management screen. A pending invite has no
// scout_user row yet (see db/schema.ts's comment on scout_invite), so it's
// a separate list, not a placeholder membership row.
export async function getTeam(organizationId: string) {
  const rows = await db
    .select({
      membershipId: memberships.id,
      userId: memberships.userId,
      role: memberships.role,
      createdAt: memberships.createdAt,
      name: users.name,
      email: users.email,
    })
    .from(memberships)
    .innerJoin(users, eq(memberships.userId, users.id))
    .where(eq(memberships.organizationId, organizationId));

  const pendingInvites = await db.select().from(invites).where(eq(invites.organizationId, organizationId));

  return { members: rows as TeamMember[], pendingInvites };
}
