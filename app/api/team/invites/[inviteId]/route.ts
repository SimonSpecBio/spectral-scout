import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { invites } from "@/db/schema";
import { requireGrowerSession } from "@/lib/session";

export async function DELETE(_request: Request, { params }: { params: Promise<{ inviteId: string }> }) {
  const session = await requireGrowerSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.membershipRole !== "owner") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { inviteId } = await params;
  await db
    .delete(invites)
    .where(and(eq(invites.id, inviteId), eq(invites.organizationId, session.organizationId!)));
  return NextResponse.json({ ok: true });
}
