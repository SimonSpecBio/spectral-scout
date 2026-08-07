import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { invites, membershipRoleEnum, memberships } from "@/db/schema";
import { getTeam } from "@/lib/team";
import { requireGrowerSession } from "@/lib/session";

export async function GET() {
  const session = await requireGrowerSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const team = await getTeam(session.organizationId!);
  return NextResponse.json(team);
}

// Only an owner ("manager") can invite -- consumed by auth.ts's session
// callback the invited email's first sign-in (see scout_invite's comment).
export async function POST(request: NextRequest) {
  const session = await requireGrowerSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.membershipRole !== "owner") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json();
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!email) return NextResponse.json({ error: "email is required" }, { status: 400 });
  const role = membershipRoleEnum.enumValues.includes(body.role) ? body.role : "member";

  const [existingInvite] = await db
    .select()
    .from(invites)
    .where(and(eq(invites.organizationId, session.organizationId!), eq(invites.email, email)));
  if (existingInvite) return NextResponse.json({ error: "Already invited" }, { status: 409 });

  const [row] = await db
    .insert(invites)
    .values({ organizationId: session.organizationId!, email, role, invitedByUserId: session.user!.id! })
    .returning();
  return NextResponse.json(row);
}
