import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { organizations } from "@/db/schema";
import { CURRENT_CONSENT_VERSION } from "@/lib/consent";
import { requireGrowerSession } from "@/lib/session";
import { isValidStateCode } from "@/lib/us-states";

// Owner-only, same pattern as /api/thresholds -- this is what the
// onboarding form (app/app/onboarding) submits to, and what proxy.ts's
// gate is waiting on (organizationState/organizationConsentVersion become
// current once this succeeds, so the redirect stops firing on the owner's
// next request). name/state are optional per-request -- an org that
// already has both set (catching up to a later consent-version bump) can
// send a consent-only payload without re-sending values it already gave.
// consentAccepted is never optional: rejected outright (400) rather than
// defaulted, since it's a real "no" state, not something to paper over.
export async function PATCH(request: NextRequest) {
  const session = await requireGrowerSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.membershipRole !== "owner") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json();

  let name: string | undefined;
  if (body.name !== undefined) {
    name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) return NextResponse.json({ error: "Organization name is required" }, { status: 400 });
  }

  let state: string | undefined;
  if (body.state !== undefined) {
    const stateInput = typeof body.state === "string" ? body.state.trim().toUpperCase() : "";
    if (!isValidStateCode(stateInput)) return NextResponse.json({ error: "A valid state is required" }, { status: 400 });
    state = stateInput;
  }

  if (body.consentAccepted !== true) {
    return NextResponse.json({ error: "You must accept the data agreement to continue" }, { status: 400 });
  }

  // Checked against the real DB row, not just trusted from the client's
  // needsAgeConfirmation prop -- an org that already has ageConfirmedAt set
  // never needs to resend it (never re-asked, per the schema column's own
  // comment), but one that doesn't yet MUST send ageConfirmed: true every
  // time, same "real no, not a default" rigor as consentAccepted above.
  const [existing] = await db.select().from(organizations).where(eq(organizations.id, session.organizationId!));
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!existing.ageConfirmedAt && body.ageConfirmed !== true) {
    return NextResponse.json({ error: "You must confirm your age to continue" }, { status: 400 });
  }

  const [row] = await db
    .update(organizations)
    .set({
      ...(name !== undefined ? { name } : {}),
      ...(state !== undefined ? { state } : {}),
      dataConsentVersion: CURRENT_CONSENT_VERSION,
      dataConsentAcceptedAt: new Date(),
      dataConsentAcceptedByUserId: session.user?.id ?? null,
      ...(!existing.ageConfirmedAt ? { ageConfirmedAt: new Date() } : {}),
    })
    .where(eq(organizations.id, session.organizationId!))
    .returning();
  return NextResponse.json(row);
}
