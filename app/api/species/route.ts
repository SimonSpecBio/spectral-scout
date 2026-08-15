import { asc, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { customSpecies, eventKindEnum } from "@/db/schema";
import { requireGrowerSession } from "@/lib/session";

// Read is open to any org member -- SpeciesPicker needs this for every
// creation flow, not just the settings page. Writes are owner-only,
// enforced in POST/DELETE.
export async function GET() {
  const session = await requireGrowerSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rows = await db
    .select()
    .from(customSpecies)
    .where(eq(customSpecies.organizationId, session.organizationId!))
    .orderBy(asc(customSpecies.commonName));
  return NextResponse.json(rows);
}

export async function POST(request: NextRequest) {
  const session = await requireGrowerSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.membershipRole !== "owner") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json();
  const commonName = typeof body.commonName === "string" ? body.commonName.trim() : "";
  const scientificName = typeof body.scientificName === "string" && body.scientificName.trim() ? body.scientificName.trim() : null;
  const kind = eventKindEnum.enumValues.includes(body.kind) ? body.kind : "pest";
  if (!commonName) return NextResponse.json({ error: "commonName is required" }, { status: 400 });

  const [row] = await db
    .insert(customSpecies)
    .values({ organizationId: session.organizationId!, kind, commonName, scientificName })
    .returning();
  return NextResponse.json(row);
}
