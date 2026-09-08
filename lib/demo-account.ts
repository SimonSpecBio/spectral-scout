// Shared between app/api/demo-login/route.ts (creates the session) and
// proxy.ts (has to recognize one without a cookie -- see its comment on
// why a cookie-only flow doesn't work for a stateless HTTP client).
//
// Two real identities (Phase 0.75, build-cycle doc 2026-09-07): a Manager
// (owner) and a Scout (member) in the SAME shared org, not a UI role
// switcher -- the existing owner/member-branched UI (app/app/page.tsx's
// isScout split) already renders correctly for whichever one signs in,
// so this is purely about having a real, reachable member-role identity
// to sign into at all. Before this, ensureDemoUser only ever created an
// owner, so the Scout home (Today's Tasks -> case -> action) was
// unreachable without a real customer org.
export const DEMO_MANAGER_EMAIL = "demo@spectralscout.app";
export const DEMO_SCOUT_EMAIL = "demo-scout@spectralscout.app";
// Back-compat alias -- the original single demo link/bookmark keeps
// resolving to the same account it always did.
export const DEMO_EMAIL = DEMO_MANAGER_EMAIL;
export const DEMO_EMAILS = [DEMO_MANAGER_EMAIL, DEMO_SCOUT_EMAIL] as const;
export const DEMO_QUERY_PARAM = "demo";
// Shortened from 30 days (ticket recFlz4adX8fhWS61) -- the token this
// bounds travels in a URL (browser history, server access logs, anywhere
// a link gets pasted), which is a much easier place for it to leak than a
// normal httpOnly cookie. 24 hours is still generous for "try the demo
// right now" while meaningfully bounding how long a leaked token stays
// exploitable. Unrelated to how long a real grower's Google/email session
// lasts (auth.ts, NextAuth's own default) -- this constant is demo-only.
export const DEMO_SESSION_MAX_AGE_MS = 24 * 60 * 60 * 1000;

// Simon's call (2026-09-04, ticket reccd0tK03RESZA6f): the demo account is
// deliberately zero-verification and publicly linked from the landing page,
// so its two real-cost/real-risk surfaces -- inviting arbitrary emails into
// the shared org, and unmetered Vercel Blob photo uploads -- are disabled
// for this one account rather than added friction for every real grower.
// Applies to BOTH demo identities equally -- the Scout identity is no less
// public/zero-verification than the Manager one.
export function isDemoSession(session: { user?: { email?: string | null } | null } | null | undefined): boolean {
  const email = session?.user?.email?.toLowerCase();
  return !!email && (DEMO_EMAILS as readonly string[]).includes(email);
}
