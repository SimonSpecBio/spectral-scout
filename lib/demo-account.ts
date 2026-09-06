// Shared between app/api/demo-login/route.ts (creates the session) and
// proxy.ts (has to recognize one without a cookie -- see its comment on
// why a cookie-only flow doesn't work for a stateless HTTP client).
export const DEMO_EMAIL = "demo@spectralscout.app";
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
export function isDemoSession(session: { user?: { email?: string | null } | null } | null | undefined): boolean {
  return session?.user?.email?.toLowerCase() === DEMO_EMAIL;
}
