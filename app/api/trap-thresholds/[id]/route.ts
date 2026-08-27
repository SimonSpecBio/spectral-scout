import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { trapThresholds } from "@/db/schema";
import { requireGrowerSession } from "@/lib/session";

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireGrowerSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.membershipRole !== "owner") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const [row] = await db
    .delete(trapThresholds)
    .where(and(eq(trapThresholds.id, id), eq(trapThresholds.organizationId, session.organizationId!)))
    .returning();
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
