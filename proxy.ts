import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { CURRENT_CONSENT_VERSION } from "@/lib/consent";
import { encodeSessionHeader, SESSION_HEADER_NAME } from "@/lib/session-cache";

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
export default auth((req) => {
  const { pathname } = req.nextUrl;

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
