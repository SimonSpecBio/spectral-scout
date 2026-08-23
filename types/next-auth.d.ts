import type { DefaultSession } from "next-auth";

// Adds the role/org fields auth.ts's session callback attaches. role is
// "staff" for the internal allowlist, "grower" for everyone else (both
// free-tier and pilot-program organizations, distinguished by accountTier).
declare module "next-auth" {
  interface Session {
    role: "staff" | "grower" | null;
    organizationId: string | null;
    accountTier: "general" | "pilot" | null;
    // Null until the owner completes onboarding (name + state) --
    // proxy.ts redirects grower/owner sessions with no state set to
    // /app/onboarding. Only ever meaningful for role="grower"; always
    // null for staff, same as the other org-scoped fields above.
    organizationState: string | null;
    // Null (or stale vs lib/consent.ts's CURRENT_CONSENT_VERSION) sends the
    // owner back through onboarding's consent step -- see proxy.ts.
    organizationConsentVersion: string | null;
    // "owner" doubles as SCHEDULING.md's "manager" role (team invites/removal,
    // task assignment); "member" as "scout". See scout_membership's comment.
    membershipRole: "owner" | "member" | null;
    // Null = not yet set -- treated as "commercial" everywhere this gates
    // copy/UI (db/schema.ts's growerTypeEnum comment).
    growerType: "home_single_tent" | "home_multi_tent" | "home_room" | "commercial" | null;
    user: DefaultSession["user"];
  }
}
