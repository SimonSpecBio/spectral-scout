// Shared between app/api/demo-login/route.ts (creates the session) and
// proxy.ts (has to recognize one without a cookie -- see its comment on
// why a cookie-only flow doesn't work for a stateless HTTP client).
export const DEMO_EMAIL = "demo@spectralscout.app";
export const DEMO_QUERY_PARAM = "demo";
export const DEMO_SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // matches NextAuth's database-session default
