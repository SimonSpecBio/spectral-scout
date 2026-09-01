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

// Both fields are optional per-request -- an org can set just the
// occupancy override, just the density override, or both in one call
// (CatalogClient sends whichever field its form actually collected).
// Whichever is omitted keeps its existing value on an update, or falls
// back to the DEFAULT_* constant (lib/threshold-engine.ts) on a fresh row.
export async function POST(request: NextRequest) {
  const session = await requireGrowerSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.membershipRole !== "owner") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json();
  const pestSpecies = typeof body.pestSpecies === "string" ? body.pestSpecies.trim() : "";
  if (!pestSpecies) return NextResponse.json({ error: "pestSpecies is required" }, { status: 400 });

  let infestedPctThreshold: number | null | undefined;
  if (body.infestedPctThreshold !== undefined && body.infestedPctThreshold !== null && body.infestedPctThreshold !== "") {
    infestedPctThreshold = Number(body.infestedPctThreshold);
    if (!Number.isFinite(infestedPctThreshold) || infestedPctThreshold <= 0 || infestedPctThreshold > 100) {
      return NextResponse.json({ error: "infestedPctThreshold must be between 0 and 100" }, { status: 400 });
    }
  }

  let densityThreshold: number | null | undefined;
  if (body.densityThreshold !== undefined && body.densityThreshold !== null && body.densityThreshold !== "") {
    densityThreshold = Number(body.densityThreshold);
    if (!Number.isFinite(densityThreshold) || densityThreshold <= 0) {
      return NextResponse.json({ error: "densityThreshold must be a positive number" }, { status: 400 });
    }
  }

  // Tri-state: absent -> leave whatever's already saved (or unset, on a
  // fresh row) alone; true/false -> an explicit override in that
  // direction; null -> explicitly clear back to the catalog default. This
  // is the only field here that's meaningfully three-valued -- the numeric
  // ones above only distinguish "provided" from "not provided."
  let presenceTriggeredOverride: boolean | null | undefined;
  if (body.presenceTriggeredOverride !== undefined) {
    presenceTriggeredOverride = body.presenceTriggeredOverride === null ? null : Boolean(body.presenceTriggeredOverride);
  }

  if (infestedPctThreshold === undefined && densityThreshold === undefined && presenceTriggeredOverride === undefined) {
    return NextResponse.json({ error: "infestedPctThreshold, densityThreshold, or presenceTriggeredOverride is required" }, { status: 400 });
  }

  const existing = await db
    .select()
    .from(monitoringThresholds)
    .where(eq(monitoringThresholds.organizationId, session.organizationId!));
  const match = existing.find((t) => t.pestSpecies.toLowerCase() === pestSpecies.toLowerCase());

  if (match) {
    const [row] = await db
      .update(monitoringThresholds)
      .set({
        ...(infestedPctThreshold !== undefined ? { infestedPctThreshold } : {}),
        ...(densityThreshold !== undefined ? { densityThreshold } : {}),
        ...(presenceTriggeredOverride !== undefined ? { presenceTriggeredOverride } : {}),
      })
      .where(eq(monitoringThresholds.id, match.id))
      .returning();
    return NextResponse.json(row);
  }

  const [row] = await db
    .insert(monitoringThresholds)
    .values({
      organizationId: session.organizationId!,
      pestSpecies,
      infestedPctThreshold: infestedPctThreshold ?? null,
      densityThreshold: densityThreshold ?? null,
      presenceTriggeredOverride: presenceTriggeredOverride ?? null,
    })
    .returning();
  return NextResponse.json(row);
}
