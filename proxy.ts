import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { sessions, users } from "@/db/auth-schema";
import { memberships, organizations } from "@/db/schema";
import { CURRENT_CONSENT_VERSION } from "@/lib/consent";
import { DEMO_EMAILS, DEMO_QUERY_PARAM, DEMO_SESSION_MAX_AGE_MS } from "@/lib/demo-account";
import { encodeSessionHeader, SESSION_HEADER_NAME } from "@/lib/session-cache";

// A stateless HTTP client (a lot of simple AI-agent web fetchers, as
// opposed to a real browser) can follow the demo-login redirect but not
// carry its Set-Cookie into the next request -- so the token also travels
// in the URL itself (see app/api/demo-login/route.ts). Resolved directly
// against the sessions table rather than through auth()'s cookie-based
// lookup, and hard-locked to the two fixed demo accounts (Manager/Scout,
// same shared org) by email: a token value that happened to belong to some
// OTHER user's real session could never be used this way to get into their
// account, only ever the shared demo org.
async function resolveDemoQuerySession(token: string) {
  const [row] = await db.select().from(sessions).where(eq(sessions.sessionToken, token));
  if (!row || row.expires < new Date()) return null;
  const [user] = await db.select().from(users).where(eq(users.id, row.userId));
  if (!user || !(DEMO_EMAILS as readonly string[]).includes(user.email ?? "")) return null;
  const [membership] = await db.select().from(memberships).where(eq(memberships.userId, user.id));
  if (!membership) return null;
  const [org] = await db.select().from(organizations).where(eq(organizations.id, membership.organizationId));
  return {
    user: { id: user.id, name: user.name, email: user.email, image: user.image },
    expires: row.expires.toISOString(),
    role: "grower" as const,
    organizationId: membership.organizationId,
    accountTier: org?.accountTier ?? "general",
    organizationState: org?.state ?? null,
    organizationConsentVersion: org?.dataConsentVersion ?? null,
    membershipRole: membership.role,
    growerType: org?.growerType ?? null,
  };
}

// Real script/style/img/connect-src CSP (follow-up to ticket 106's
// frame-ancestors-only pass) for the signed-in app surface -- /app/* and
// /staff/*, where a real session and real actions live, is the highest-
// value target for this. Uses Next's documented nonce pattern rather than
// 'unsafe-inline' for script-src: Next's own inline hydration scripts
// (the RSC streaming payload pushes -- no hand-written inline <script> tags
// exist in this app, confirmed by grep) pick up whichever nonce is present
// in this response's own CSP header automatically, so a real XSS-injected
// inline script (no way to predict a per-request nonce) still gets
// blocked. 'unsafe-eval' only in dev -- Turbopack/webpack's HMR client
// needs it; a production build does not.
//
// img-src's blob-storage host is this project's actual Vercel Blob store
// (verified against real stored URLs, not guessed) -- wildcarded on the
// subdomain in case the store id ever rotates. No external fonts (next/font
// self-hosts Manrope at build time), no third-party client-side fetches
// anywhere in the app (grep-verified) -- Google OAuth's redirect to
// accounts.google.com is a full top-level navigation, not a fetch/frame,
// so it isn't governed by connect-src/frame-src here.
//
// Also applied to the public surface -- "/", /sign-in + /sign-in/check-email,
// /privacy, /offline (ticket recVziWMfTj1UB3hb) -- audited individually and
// each one only ever renders self-hosted images and same-origin server-action
// forms, so the exact same policy holds; no widening needed for this
// specific set of pages. The old /share/[token] public page named in that
// ticket no longer exists (replaced by the team-only in-app share
// notification, app/api/.../share/route.ts, which already sits behind a
// session and this middleware's existing /api/* matcher). /api/auth/* stays
// excluded -- those are NextAuth's internal signin/callback/session
// endpoints, not HTML pages this app renders (pages.signIn/error/verifyRequest
// all point at the /sign-in routes above instead), so there's no <script> for
// a nonce to attach to there.
function cspHeaderFor(nonce: string): string {
  const scriptSrc = process.env.NODE_ENV === "production" ? `'nonce-${nonce}' 'strict-dynamic'` : `'nonce-${nonce}' 'strict-dynamic' 'unsafe-eval'`;
  return [
    `script-src 'self' ${scriptSrc}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https://*.public.blob.vercel-storage.com",
    "font-src 'self'",
    // Sentry's ingest endpoint (Phase 0.2b, build-cycle doc 2026-09-07) --
    // without this, the browser silently drops every client-side error
    // report instead of sending it, since instrumentation-client.ts's
    // Sentry.init() calls fetch/sendBeacon straight to this host, not
    // through a same-origin route. Host is fixed per Sentry org, matches
    // the DSN in SENTRY_DSN/NEXT_PUBLIC_SENTRY_DSN.
    "connect-src 'self' https://o4512047240839168.ingest.us.sentry.io",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}

// Sets the CSP on BOTH the outgoing request headers (Next's own page
// rendering reads this to nonce its generated <script> tags -- the
// documented mechanism, not something reverse-engineered here) and the
// response headers (what the browser actually enforces against). Mutates
// `forwardHeaders` in place since every caller already builds one to carry
// the session header through.
function applyCsp(forwardHeaders: Headers): string {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = cspHeaderFor(nonce);
  forwardHeaders.set("Content-Security-Policy", csp);
  return csp;
}

// Guards /app/* (grower) and /staff/* (internal) plus their API routes.
// "/" stays public -- it's the marketing/landing page and sign-in entry for
// a self-serve free tool, unlike the other three apps where every page
// requires a session. /api/auth/* stays public (NextAuth's own flow),
// /api/cron/* authenticates via a bearer secret instead of a session, and
// /api/demo-login is deliberately the one route anyone can hit with zero
// session -- that's its entire job (see its own comment for the abuse
// tradeoffs already accepted). Role/org-scoping happens inside each route
// handler (lib/session.ts) -- path-based gating alone can't express "this
// org's data only."
// Exact/prefix match for the public pages the nonce CSP now also covers --
// checked before any auth logic runs so a signed-out visit to "/" (this
// app's actual marketing page, unlike /app and /staff which always require
// a session) still renders instead of being caught by the sign-in redirect
// at the bottom of this function.
function isPublicCspPage(pathname: string): boolean {
  return pathname === "/" || pathname === "/privacy" || pathname === "/offline" || pathname.startsWith("/sign-in");
}

export default auth(async (req) => {
  const { pathname } = req.nextUrl;

  if (isPublicCspPage(pathname)) {
    const forwardHeaders = new Headers(req.headers);
    const csp = applyCsp(forwardHeaders);
    const response = NextResponse.next({ request: { headers: forwardHeaders } });
    response.headers.set("Content-Security-Policy", csp);
    return response;
  }

  const demoToken = req.nextUrl.searchParams.get(DEMO_QUERY_PARAM);
  if (demoToken && !req.auth) {
    const demoSession = await resolveDemoQuerySession(demoToken);
    if (demoSession) {
      // Mint a FRESH session token for this browser rather than writing the
      // URL's own token straight into its cookie jar (ticket
      // recFlz4adX8fhWS61 -- a textbook session fixation: the token in the
      // URL is exactly as reusable as a cookie, so an attacker who kept
      // their own /api/demo-login token and sent someone else a link like
      // /app/new-event?demo=<attacker_token> would land that visitor on the
      // SAME session the attacker already holds, readable at will). This
      // way the value that ends up in the URL/browser-history/server-logs
      // and the value that actually authenticates this browser going
      // forward are two different tokens -- knowing one no longer means
      // holding the other. Same demo-only/DEMO_EMAILS lock as
      // resolveDemoQuerySession itself, so this still can never mint a
      // session for anything but the one shared demo org.
      const freshToken = crypto.randomUUID() + crypto.randomUUID();
      const expires = new Date(Date.now() + DEMO_SESSION_MAX_AGE_MS);
      await db.insert(sessions).values({ sessionToken: freshToken, userId: demoSession.user.id, expires });

      const forwardHeaders = new Headers(req.headers);
      forwardHeaders.set(SESSION_HEADER_NAME, encodeSessionHeader({ ...demoSession, expires: expires.toISOString() }));
      const csp = applyCsp(forwardHeaders);
      const response = NextResponse.next({ request: { headers: forwardHeaders } });
      response.headers.set("Content-Security-Policy", csp);
      // A real browser gets the fresh token as its cookie -- later requests
      // stop needing ?demo= in the URL at all. A stateless client that
      // never keeps cookies (the original reason for the query param) still
      // works exactly as before: it just keeps sending its OWN original
      // token on every request, which resolveDemoQuerySession above keeps
      // accepting on its own terms.
      const isHttps = req.nextUrl.protocol === "https:";
      response.cookies.set(isHttps ? "__Secure-authjs.session-token" : "authjs.session-token", freshToken, {
        httpOnly: true,
        secure: isHttps,
        sameSite: "lax",
        path: "/",
        expires,
      });
      return response;
    }
  }

  if (req.auth) {
    // A brand-new org's owner (auto-provisioned silently on first sign-in,
    // see auth.ts) hasn't named their org, said what state they're in, or
    // accepted the data agreement yet -- none of this is optional/skippable
    // the way adding a site/team member is: state is what makes cannabis-
    // legal-status filtering possible at all (lib/us-states.ts), and
    // consent is a real "I agree" gate, not a formality. A stale consent
    // version (existing orgs from before this feature shipped, or after a
    // future material copy change) sends them back through the SAME
    // onboarding route -- OnboardingPage detects "state already set" and
    // skips straight to just the consent step rather than re-asking for
    // info it already has. Members of an org someone else already owns
    // aren't blocked by any of this -- only the owner is on the hook.
    // /api/organizations stays reachable so onboarding's own PATCH can
    // actually go through while gated.
    if (
      req.auth.role === "grower" &&
      req.auth.membershipRole === "owner" &&
      (!req.auth.organizationState || req.auth.organizationConsentVersion !== CURRENT_CONSENT_VERSION) &&
      pathname !== "/app/onboarding" &&
      !pathname.startsWith("/api/organizations")
    ) {
      return NextResponse.redirect(new URL("/app/onboarding", req.nextUrl.origin));
    }
    // Hand the session this auth() call already paid for down to the page/
    // route handler via a signed header, so lib/session.ts doesn't re-run
    // the same staff/membership/organization lookup chain a second time
    // for the same request (see lib/session-cache.ts).
    const forwardHeaders = new Headers(req.headers);
    forwardHeaders.set(SESSION_HEADER_NAME, encodeSessionHeader(req.auth));
    const csp = applyCsp(forwardHeaders);
    const response = NextResponse.next({ request: { headers: forwardHeaders } });
    response.headers.set("Content-Security-Policy", csp);
    return response;
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const signInUrl = new URL("/api/auth/signin", req.nextUrl.origin);
  signInUrl.searchParams.set("callbackUrl", req.nextUrl.href);
  return NextResponse.redirect(signInUrl);
});

// The negative lookahead does path-SEGMENT exclusion, not substring --
// (?!auth|cron|...) alone would also exclude e.g. a future /api/authorize
// route from the auth gate entirely (its path literally starts with the
// substring "auth"), shipping it unauthenticated by accident with no
// warning. Each excluded name must be followed by "/" or end-of-path to
// actually match.
export const config = {
  matcher: ["/", "/privacy", "/offline", "/sign-in", "/sign-in/:path*", "/app/:path*", "/staff/:path*", "/api/((?!auth/|cron/|demo-login(?:/|$)|health(?:/|$)).*)"],
};
