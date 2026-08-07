import type { DefaultSession } from "next-auth";

// Adds the role/org fields auth.ts's session callback attaches. role is
// "staff" for the internal allowlist, "grower" for everyone else (both
// free-tier and pilot-program organizations, distinguished by accountTier).
declare module "next-auth" {
  interface Session {
    role: "staff" | "grower" | null;
    organizationId: string | null;
    accountTier: "general" | "pilot" | null;
    // "owner" doubles as SCHEDULING.md's "manager" role (team invites/removal,
    // task assignment); "member" as "scout". See scout_membership's comment.
    membershipRole: "owner" | "member" | null;
    user: DefaultSession["user"];
  }
}
