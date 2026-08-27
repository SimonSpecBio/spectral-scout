import { asc, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { trapThresholds } from "@/db/schema";
import { requireGrowerSession } from "@/lib/session";

// Same read-open/write-owner-only split as /api/thresholds, and the same
// upsert-by-lowercased-name rule -- lib/trap-alerts.ts matches pestSpecies
// case-insensitively and takes the one row, so two differently-cased rows
// for the same species would silently disagree with each other.
export async function GET() {
  const session = await requireGrowerSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rows = await db
    .select()
    .from(trapThresholds)
    .where(eq(trapThresholds.organizationId, session.organizationId!))
    .orderBy(asc(trapThresholds.pestSpecies));
  return NextResponse.json(rows);
}

export async function POST(request: NextRequest) {
  const session = await requireGrowerSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.membershipRole !== "owner") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json();
  const pestSpecies = typeof body.pestSpecies === "string" ? body.pestSpecies.trim() : "";
  if (!pestSpecies) return NextResponse.json({ error: "pestSpecies is required" }, { status: 400 });

  const catchPerDayThreshold = Number(body.catchPerDayThreshold);
  if (!Number.isFinite(catchPerDayThreshold) || catchPerDayThreshold <= 0) {
    return NextResponse.json({ error: "catchPerDayThreshold must be a positive number" }, { status: 400 });
  }

  const existing = await db.select().from(trapThresholds).where(eq(trapThresholds.organizationId, session.organizationId!));
  const match = existing.find((t) => t.pestSpecies.toLowerCase() === pestSpecies.toLowerCase());

  if (match) {
    const [row] = await db
      .update(trapThresholds)
      .set({ catchPerDayThreshold })
      .where(eq(trapThresholds.id, match.id))
      .returning();
    return NextResponse.json(row);
  }

  const [row] = await db
    .insert(trapThresholds)
    .values({ organizationId: session.organizationId!, pestSpecies, catchPerDayThreshold })
    .returning();
  return NextResponse.json(row);
}
