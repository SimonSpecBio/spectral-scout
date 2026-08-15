import { asc, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { monitoringThresholds } from "@/db/schema";
import { requireGrowerSession } from "@/lib/session";

// Read is open to any org member (the pest-event pressure chart reads
// these live); writes are owner-only. lib/threshold-engine.ts matches
// pestSpecies case-insensitively and takes the first row, so POST here
// upserts by lowercased name instead of allowing duplicate rows that
// could silently disagree with each other.
export async function GET() {
  const session = await requireGrowerSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rows = await db
    .select()
    .from(monitoringThresholds)
    .where(eq(monitoringThresholds.organizationId, session.organizationId!))
    .orderBy(asc(monitoringThresholds.pestSpecies));
  return NextResponse.json(rows);
}

export async function POST(request: NextRequest) {
  const session = await requireGrowerSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.membershipRole !== "owner") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json();
  const pestSpecies = typeof body.pestSpecies === "string" ? body.pestSpecies.trim() : "";
  const infestedPctThreshold = Number(body.infestedPctThreshold);
  if (!pestSpecies) return NextResponse.json({ error: "pestSpecies is required" }, { status: 400 });
  if (!Number.isFinite(infestedPctThreshold) || infestedPctThreshold <= 0 || infestedPctThreshold > 100) {
    return NextResponse.json({ error: "infestedPctThreshold must be between 0 and 100" }, { status: 400 });
  }

  const existing = await db
    .select()
    .from(monitoringThresholds)
    .where(eq(monitoringThresholds.organizationId, session.organizationId!));
  const match = existing.find((t) => t.pestSpecies.toLowerCase() === pestSpecies.toLowerCase());

  if (match) {
    const [row] = await db
      .update(monitoringThresholds)
      .set({ infestedPctThreshold })
      .where(eq(monitoringThresholds.id, match.id))
      .returning();
    return NextResponse.json(row);
  }

  const [row] = await db
    .insert(monitoringThresholds)
    .values({ organizationId: session.organizationId!, pestSpecies, infestedPctThreshold })
    .returning();
  return NextResponse.json(row);
}
