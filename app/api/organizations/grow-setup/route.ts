import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { growerTypeEnum, organizations } from "@/db/schema";
import { requireGrowerSession } from "@/lib/session";

// Separate from /api/organizations' PATCH (which is the onboarding/consent
// endpoint and unconditionally requires consentAccepted) -- this is a plain
// settings update a grower can make any time, not tied to the consent gate.
export async function PATCH(request: NextRequest) {
  const session = await requireGrowerSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.membershipRole !== "owner") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json();

  let growerType: (typeof growerTypeEnum.enumValues)[number] | null | undefined;
  if (body.growerType !== undefined) {
    if (body.growerType === null) {
      growerType = null;
    } else if (growerTypeEnum.enumValues.includes(body.growerType)) {
      growerType = body.growerType;
    } else {
      return NextResponse.json({ error: "Invalid grower type" }, { status: 400 });
    }
  }

  const growSizeLabel = typeof body.growSizeLabel === "string" ? body.growSizeLabel.trim().slice(0, 200) || null : undefined;

  const [row] = await db
    .update(organizations)
    .set({
      ...(growerType !== undefined ? { growerType } : {}),
      ...(growSizeLabel !== undefined ? { growSizeLabel } : {}),
    })
    .where(eq(organizations.id, session.organizationId!))
    .returning();
  return NextResponse.json(row);
}
