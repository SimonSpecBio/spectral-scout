import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { facilities } from "@/db/schema";
import { requireGrowerSession } from "@/lib/session";

// organizationId always comes from the session, never the client -- same
// scoping pattern as spectral-pilot's reports route.
export async function GET() {
  const session = await requireGrowerSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rows = await db.select().from(facilities).where(eq(facilities.organizationId, session.organizationId!));
  return NextResponse.json(rows);
}

export async function POST(request: NextRequest) {
  const session = await requireGrowerSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });

  const [row] = await db
    .insert(facilities)
    .values({ organizationId: session.organizationId!, name })
    .returning();
  return NextResponse.json(row);
}
