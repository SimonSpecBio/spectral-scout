import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { sessions, users } from "@/db/auth-schema";
import { memberships, organizations } from "@/db/schema";
import { CURRENT_CONSENT_VERSION } from "@/lib/consent";
import { DEMO_EMAIL, DEMO_QUERY_PARAM } from "@/lib/demo-account";
import { encodeSessionHeader, SESSION_HEADER_NAME } from "@/lib/session-cache";

// A stateless HTTP client (a lot of simple AI-agent web fetchers, as
// opposed to a real browser) can follow the demo-login redirect but not
// carry its Set-Cookie into the next request -- so the token also travels
// in the URL itself (see app/api/demo-login/route.ts). Resolved directly
// against the sessions table rather than through auth()'s cookie-based
// lookup, and hard-locked to the fixed demo account by email: a token
// value that happened to belong to some OTHER user's real session could
// never be used this way to get into their account, only ever the shared
// demo org.
async function resolveDemoQuerySession(token: string) {
  const [row] = await db.select().from(sessions).where(eq(sessions.sessionToken, token));
  if (!row || row.expires < new Date()) return null;
  const [user] = await db.select().from(users).where(eq(users.id, row.userId));
  if (!user || user.email !== DEMO_EMAIL) return null;
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
// so it isn't governed by connect-src/frame-src here. Deliberately NOT
// applied to public pages (/, /share/[token], /api/auth/* -- excluded from
// this middleware's matcher by design) since Next's nonce-in-<script>
// auto-injection needs this middleware to run on that request; those pages
// keep next.config.ts's existing, more permissive baseline instead of
// silently breaking sign-in or the share link.
function cspHeaderFor(nonce: string): string {
  const scriptSrc = process.env.NODE_ENV === "production" ? `'nonce-${nonce}' 'strict-dynamic'` : `'nonce-${nonce}' 'strict-dynamic' 'unsafe-eval'`;
  return [
    `script-src 'self' ${scriptSrc}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https://*.public.blob.vercel-storage.com",
    "font-src 'self'",
    "connect-src 'self'",
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
export default auth(async (req) => {
  const { pathname } = req.nextUrl;

  const demoToken = req.nextUrl.searchParams.get(DEMO_QUERY_PARAM);
  if (demoToken && !req.auth) {
    const demoSession = await resolveDemoQuerySession(demoToken);
    if (demoSession) {
      const forwardHeaders = new Headers(req.headers);
      forwardHeaders.set(SESSION_HEADER_NAME, encodeSessionHeader(demoSession));
      const csp = applyCsp(forwardHeaders);
      const response = NextResponse.next({ request: { headers: forwardHeaders } });
      response.headers.set("Content-Security-Policy", csp);
      // Best-effort: if this client DOES keep cookies after all, later
      // requests stop needing ?demo= at all. If it doesn't, this line does
      // nothing and the query param keeps carrying the session on its own.
      const isHttps = req.nextUrl.protocol === "https:";
      response.cookies.set(isHttps ? "__Secure-authjs.session-token" : "authjs.session-token", demoToken, {
        httpOnly: true,
        secure: isHttps,
        sameSite: "lax",
        path: "/",
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
  matcher: ["/app/:path*", "/staff/:path*", "/api/((?!auth/|cron/|demo-login(?:/|$)|health(?:/|$)).*)"],
};
