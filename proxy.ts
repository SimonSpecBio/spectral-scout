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
      const response = NextResponse.next({ request: { headers: forwardHeaders } });
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
    return NextResponse.next({ request: { headers: forwardHeaders } });
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const signInUrl = new URL("/api/auth/signin", req.nextUrl.origin);
  signInUrl.searchParams.set("callbackUrl", req.nextUrl.href);
  return NextResponse.redirect(signInUrl);
});

export const config = {
  matcher: ["/app/:path*", "/staff/:path*", "/api/((?!auth|cron|demo-login).*)"],
};
