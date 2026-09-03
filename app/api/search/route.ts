import { and, eq, ilike, inArray } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { facilities, facilityAreas, inventoryItems, pestEventComments, pestEvents, treatments } from "@/db/schema";
import { preventiveChecklist } from "@/lib/preventive-checklist";
import { displayNameForPestSpecies } from "@/lib/treatments-catalog";
import { requireGrowerSession } from "@/lib/session";

export interface SearchResult {
  type: "event" | "treatment" | "site" | "area" | "comment" | "preventive" | "inventory";
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

  // pestEvents.pestSpecies stores a catalog id (e.g. "pest_tssm") for
  // anything in the catalog, or legacy free text for older/custom entries --
  // never the human name a grower actually types or sees ("Two-Spotted
  // Spider Mite"). An ILIKE against the raw column matched only by
  // coincidence (legacy rows that happened to still be free text), which is
  // why a single word like "mite" could work while a real display-name
  // phrase like "spider mite" came up empty against a canonicalized row.
  // Filtered in JS against the resolved display name instead of pushing
  // this into SQL -- see displayNameForPestSpecies's own note on why a
  // fuzzy reverse-match isn't attempted anywhere else in the app either.
  const qLower = q.toLowerCase();

  const [matchedSites, matchedAreas, orgEvents, matchedTreatments, matchedComments, matchedInventory] = await Promise.all([
    db.select().from(facilities).where(and(inArray(facilities.id, facilityIds), ilike(facilities.name, pattern))),
    db.select().from(facilityAreas).where(and(inArray(facilityAreas.facilityId, facilityIds), ilike(facilityAreas.name, pattern))),
    db.select().from(pestEvents).where(inArray(pestEvents.facilityId, facilityIds)),
    db.select().from(treatments).where(and(inArray(treatments.facilityId, facilityIds), ilike(treatments.product, pattern))),
    db
      .select({ comment: pestEventComments, event: pestEvents })
      .from(pestEventComments)
      .innerJoin(pestEvents, eq(pestEventComments.pestEventId, pestEvents.id))
      .where(and(inArray(pestEvents.facilityId, facilityIds), ilike(pestEventComments.body, pattern))),
    db
      .select()
      .from(inventoryItems)
      .where(and(eq(inventoryItems.organizationId, session.organizationId!), ilike(inventoryItems.name, pattern))),
  ]);

  // Static, org-independent content (lib/preventive-checklist.ts) -- matched
  // in JS against pest name and tip text, same reasoning as pestEvents
  // above: there's no per-item page to deep-link to (one static checklist
  // page), so every match points at /app/preventive as a whole.
  const matchedPreventive = preventiveChecklist().filter(
    (c) => c.commonName.toLowerCase().includes(qLower) || c.items.some((item) => item.toLowerCase().includes(qLower))
  );

  const matchedEvents = orgEvents.filter(
    (e) => e.pestSpecies.toLowerCase().includes(qLower) || displayNameForPestSpecies(e.pestSpecies).toLowerCase().includes(qLower)
  );

  const results: SearchResult[] = [
    ...matchedEvents.map((e) => ({
      type: "event" as const,
      id: e.id,
      label: displayNameForPestSpecies(e.pestSpecies),
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
      sub: `Comment on ${displayNameForPestSpecies(event.pestSpecies)} · ${facilityNameById.get(event.facilityId) ?? ""}`,
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
    ...matchedInventory.map((i) => ({
      type: "inventory" as const,
      id: i.id,
      label: i.name,
      sub: `Inventory · ${i.quantity} ${i.unit} in stock`,
      href: `/app/inventory`,
    })),
    ...matchedPreventive.map((c) => ({
      type: "preventive" as const,
      id: c.pestId,
      label: c.commonName,
      sub: "Preventive checklist",
      href: `/app/preventive`,
    })),
  ];

  return NextResponse.json(results.slice(0, 50));
}
