// Shared between app/api/demo-login/route.ts (creates the session) and
// proxy.ts (has to recognize one without a cookie -- see its comment on
// why a cookie-only flow doesn't work for a stateless HTTP client).
export const DEMO_EMAIL = "demo@spectralscout.app";
export const DEMO_QUERY_PARAM = "demo";
export const DEMO_SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // matches NextAuth's database-session default

// Simon's call (2026-09-04, ticket reccd0tK03RESZA6f): the demo account is
// deliberately zero-verification and publicly linked from the landing page,
// so its two real-cost/real-risk surfaces -- inviting arbitrary emails into
// the shared org, and unmetered Vercel Blob photo uploads -- are disabled
// for this one account rather than added friction for every real grower.
export function isDemoSession(session: { user?: { email?: string | null } | null } | null | undefined): boolean {
  return session?.user?.email?.toLowerCase() === DEMO_EMAIL;
}
