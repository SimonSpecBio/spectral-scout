import { auth } from "@/auth";

// Thin helpers so every route handler enforces role/org scoping the same
// way instead of re-deriving it -- proxy.ts only checks "is there a
// session," these are what actually keep a grower scoped to their own
// organization's data.

export async function requireStaffSession() {
  const session = await auth();
  if (!session || session.role !== "staff") return null;
  return session;
}

export async function requireGrowerSession() {
  const session = await auth();
  if (!session || session.role !== "grower" || !session.organizationId) return null;
  return session;
}

export async function requireAnySession() {
  const session = await auth();
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
