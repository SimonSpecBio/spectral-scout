import { headers } from "next/headers";
import type { Session } from "next-auth";
import { auth } from "@/auth";
import { decodeSessionHeader, SESSION_HEADER_NAME } from "@/lib/session-cache";

// Thin helpers so every route handler enforces role/org scoping the same
// way instead of re-deriving it -- proxy.ts only checks "is there a
// session," these are what actually keep a grower scoped to their own
// organization's data.

// proxy.ts's auth() call already resolved this request's full session
// (including the staff/membership/org lookup chain) and forwarded it via a
// signed header -- reuse that instead of re-running the whole chain again
// here. Falls back to a real auth() call for anything the header didn't
// cover (a route outside proxy.ts's matcher, or a forged/missing header).
async function resolveSession(): Promise<Session | null> {
  const h = await headers();
  const cached = decodeSessionHeader(h.get(SESSION_HEADER_NAME));
  if (cached) return cached as Session;
  return auth();
}

export async function requireStaffSession() {
  const session = await resolveSession();
  if (!session || session.role !== "staff") return null;
  return session;
}

export async function requireGrowerSession() {
  const session = await resolveSession();
  if (!session || session.role !== "grower" || !session.organizationId) return null;
  return session;
}

export async function requireAnySession() {
  const session = await resolveSession();
  if (!session || !session.role) return null;
  return session;
}

// The hard privacy boundary from the product design: staff get full,
// org-identifiable drill-down for real pilot-program organizations (that's
// the existing contractual relationship, unchanged from today). For
// 'general' free-tier organizations -- no contract with Spectral, no
// expectation staff can see their exact data -- staff-facing routes must
// refuse to return raw per-organization detail, full stop. Every
// staff-facing route that touches organization-scoped data must gate on
// this, not just hide the drill-down link in the UI.
export function canStaffViewOrgDetail(accountTier: "general" | "pilot"): boolean {
  return accountTier === "pilot";
}
