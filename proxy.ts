import { NextResponse } from "next/server";
import { auth } from "@/auth";

// Guards /app/* (grower) and /staff/* (internal) plus their API routes.
// "/" stays public -- it's the marketing/landing page and sign-in entry for
// a self-serve free tool, unlike the other three apps where every page
// requires a session. /api/auth/* stays public (NextAuth's own flow) and
// /api/cron/* authenticates via a bearer secret instead of a session.
// Role/org-scoping happens inside each route handler (lib/session.ts) --
// path-based gating alone can't express "this org's data only."
export default auth((req) => {
  if (req.auth) return NextResponse.next();

  const { pathname } = req.nextUrl;
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const signInUrl = new URL("/api/auth/signin", req.nextUrl.origin);
  signInUrl.searchParams.set("callbackUrl", req.nextUrl.href);
  return NextResponse.redirect(signInUrl);
});

export const config = {
  matcher: ["/app/:path*", "/staff/:path*", "/api/((?!auth|cron).*)"],
};
