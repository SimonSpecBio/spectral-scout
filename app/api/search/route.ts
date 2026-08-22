import { and, eq, ilike, inArray } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { facilities, facilityAreas, pestEventComments, pestEvents, treatments } from "@/db/schema";
import { requireGrowerSession } from "@/lib/session";

export interface SearchResult {
  type: "event" | "treatment" | "site" | "area" | "comment";
  id: string;
  label: string;
  sub: string;
  href: string;
}

// A handful of ILIKE queries across the fields most worth finding, unioned
// into one ranked-by-type list -- not full-text-search infrastructure.
// Postgres tsvector is the real upgrade path if ILIKE gets slow once orgs
// have real history; not needed on day one. Skips photo content and map
// geometry entirely, same as spec'd.
export async function GET(request: NextRequest) {
  const session = await requireGrowerSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const q = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) return NextResponse.json([]);
  const pattern = `%${q}%`;

  const orgFacilities = await db.select().from(facilities).where(eq(facilities.organizationId, session.organizationId!));
  const facilityIds = orgFacilities.map((f) => f.id);
  const facilityNameById = new Map(orgFacilities.map((f) => [f.id, f.name]));
  if (facilityIds.length === 0) return NextResponse.json([]);

  const [matchedSites, matchedAreas, matchedEvents, matchedTreatments, matchedComments] = await Promise.all([
    db.select().from(facilities).where(and(inArray(facilities.id, facilityIds), ilike(facilities.name, pattern))),
    db.select().from(facilityAreas).where(and(inArray(facilityAreas.facilityId, facilityIds), ilike(facilityAreas.name, pattern))),
    db.select().from(pestEvents).where(and(inArray(pestEvents.facilityId, facilityIds), ilike(pestEvents.pestSpecies, pattern))),
    db.select().from(treatments).where(and(inArray(treatments.facilityId, facilityIds), ilike(treatments.product, pattern))),
    db
      .select({ comment: pestEventComments, event: pestEvents })
      .from(pestEventComments)
      .innerJoin(pestEvents, eq(pestEventComments.pestEventId, pestEvents.id))
      .where(and(inArray(pestEvents.facilityId, facilityIds), ilike(pestEventComments.body, pattern))),
  ]);

  const results: SearchResult[] = [
    ...matchedEvents.map((e) => ({
      type: "event" as const,
      id: e.id,
      label: e.pestSpecies,
      sub: `Pest event · ${facilityNameById.get(e.facilityId) ?? ""}`,
      href: `/app/facilities/${e.facilityId}/pest-events/${e.id}`,
    })),
    ...matchedTreatments
      .filter((t) => !!t.pestEventId)
      .map((t) => ({
        type: "treatment" as const,
        id: t.id,
        label: t.product ?? t.type,
        sub: `Treatment · ${facilityNameById.get(t.facilityId) ?? ""}`,
        href: `/app/facilities/${t.facilityId}/pest-events/${t.pestEventId}?tab=treatments`,
      })),
    ...matchedComments.map(({ comment, event }) => ({
      type: "comment" as const,
      id: comment.id,
      label: comment.body.length > 80 ? `${comment.body.slice(0, 80)}…` : comment.body,
      sub: `Comment on ${event.pestSpecies} · ${facilityNameById.get(event.facilityId) ?? ""}`,
      href: `/app/facilities/${event.facilityId}/pest-events/${event.id}?tab=comments`,
    })),
    ...matchedSites.map((f) => ({
      type: "site" as const,
      id: f.id,
      label: f.name,
      sub: "Site",
      href: `/app/facilities/${f.id}`,
    })),
    ...matchedAreas.map((a) => ({
      type: "area" as const,
      id: a.id,
      label: a.name,
      sub: `Area · ${facilityNameById.get(a.facilityId) ?? ""}`,
      href: `/app/facilities/${a.facilityId}/areas/${a.id}`,
    })),
  ];

  return NextResponse.json(results.slice(0, 50));
}
