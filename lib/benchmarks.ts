// Cross-org anonymized efficacy benchmarking (ticket 83). Compares how fast
// pest events actually resolved when growers used one product vs. another
// for the same pest, pooled across every free-tier ("general" accountTier)
// organization -- pilot-tier orgs are excluded even though staff can see
// their full data, because lib/consent.ts's promise ("aggregated, anonymized
// statistics across all free-tier users combined") is scoped specifically to
// free-tier usage, not pilot relationships.
//
// PRIVACY GATE: never return a comparison built from fewer than
// MIN_ORGS_PER_ARM distinct organizations on either side. This is what makes
// it "aggregate-only, never traceable back to your account" real rather than
// aspirational -- a 2-grower comparison is close enough to identifiable that
// a grower could recognize their own outcome in it.
//
// SCOPE (deliberate, not an oversight): the ticket's own example slices by
// "similar facility type/climate," but slicing this early splits an already
// small dataset into cells too small to ever clear MIN_ORGS_PER_ARM, which
// would make the feature permanently empty rather than useful. V1 is a
// single global comparison per pest; state/facility-type slicing is a real
// follow-up once there's enough volume per cell to not defeat its own
// privacy gate.
import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { db } from "@/db";
import { facilities, organizations, pestEvents, treatments } from "@/db/schema";

export const MIN_ORGS_PER_ARM = 5;

export interface ProductBenchmark {
  pestSpecies: string;
  faster: { product: string; avgDays: number; orgCount: number };
  slower: { product: string; avgDays: number; orgCount: number };
  pctFaster: number;
}

interface Bucket {
  totalDays: number;
  eventCount: number;
  orgIds: Set<string>;
}

// Compares exactly two named products for one pest. Returns null whenever
// either side doesn't clear the privacy gate, the two products tie (nothing
// honest to say), or there's simply no resolved-event data yet -- callers
// should treat null as "don't show a benchmark," never as an error.
export async function getEfficacyBenchmark(pestSpecies: string, productA: string, productB: string): Promise<ProductBenchmark | null> {
  if (productA === productB) return null;
  const q = pestSpecies.trim().toLowerCase();

  const rows = await db
    .select({
      product: treatments.product,
      orgId: facilities.organizationId,
      pestSpecies: pestEvents.pestSpecies,
      createdAt: pestEvents.createdAt,
      resolvedAt: pestEvents.resolvedAt,
    })
    .from(treatments)
    .innerJoin(pestEvents, eq(treatments.pestEventId, pestEvents.id))
    .innerJoin(facilities, eq(pestEvents.facilityId, facilities.id))
    .innerJoin(organizations, eq(facilities.organizationId, organizations.id))
    .where(
      and(
        eq(organizations.accountTier, "general"),
        eq(pestEvents.status, "resolved"),
        isNotNull(pestEvents.resolvedAt),
        inArray(treatments.product, [productA, productB])
      )
    );

  const byProduct = new Map<string, Bucket>();
  for (const r of rows) {
    if (!r.product || !r.resolvedAt || r.pestSpecies.trim().toLowerCase() !== q) continue;
    const bucket = byProduct.get(r.product) ?? { totalDays: 0, eventCount: 0, orgIds: new Set<string>() };
    bucket.totalDays += (r.resolvedAt.getTime() - r.createdAt.getTime()) / 86_400_000;
    bucket.eventCount += 1;
    bucket.orgIds.add(r.orgId);
    byProduct.set(r.product, bucket);
  }

  const a = byProduct.get(productA);
  const b = byProduct.get(productB);
  if (!a || !b || a.orgIds.size < MIN_ORGS_PER_ARM || b.orgIds.size < MIN_ORGS_PER_ARM) return null;

  const avgA = a.totalDays / a.eventCount;
  const avgB = b.totalDays / b.eventCount;
  if (avgA === avgB) return null;

  const [faster, slower, fasterAvg, slowerAvg] = avgA < avgB ? [productA, productB, avgA, avgB] : [productB, productA, avgB, avgA];
  const fasterBucket = faster === productA ? a : b;
  const slowerBucket = slower === productA ? a : b;

  return {
    pestSpecies,
    faster: { product: faster, avgDays: fasterAvg, orgCount: fasterBucket.orgIds.size },
    slower: { product: slower, avgDays: slowerAvg, orgCount: slowerBucket.orgIds.size },
    pctFaster: Math.round(((slowerAvg - fasterAvg) / slowerAvg) * 100),
  };
}

// Ranks every product in the list by average resolution days (general-tier
// only, same privacy gate) and returns the single best-vs-second-best
// comparison, if any two clear the gate. This is what the UI actually calls
// -- it doesn't know in advance which two products in a pest program's
// rotation will have enough data, so it asks for all of them and gets back
// whichever comparison is actually real.
export async function getBestEfficacyBenchmark(pestSpecies: string, productNames: string[]): Promise<ProductBenchmark | null> {
  const uniqueProducts = [...new Set(productNames)];
  if (uniqueProducts.length < 2) return null;
  const q = pestSpecies.trim().toLowerCase();

  const rows = await db
    .select({
      product: treatments.product,
      orgId: facilities.organizationId,
      pestSpecies: pestEvents.pestSpecies,
      createdAt: pestEvents.createdAt,
      resolvedAt: pestEvents.resolvedAt,
    })
    .from(treatments)
    .innerJoin(pestEvents, eq(treatments.pestEventId, pestEvents.id))
    .innerJoin(facilities, eq(pestEvents.facilityId, facilities.id))
    .innerJoin(organizations, eq(facilities.organizationId, organizations.id))
    .where(
      and(
        eq(organizations.accountTier, "general"),
        eq(pestEvents.status, "resolved"),
        isNotNull(pestEvents.resolvedAt),
        inArray(treatments.product, uniqueProducts)
      )
    );

  const byProduct = new Map<string, Bucket>();
  for (const r of rows) {
    if (!r.product || !r.resolvedAt || r.pestSpecies.trim().toLowerCase() !== q) continue;
    const bucket = byProduct.get(r.product) ?? { totalDays: 0, eventCount: 0, orgIds: new Set<string>() };
    bucket.totalDays += (r.resolvedAt.getTime() - r.createdAt.getTime()) / 86_400_000;
    bucket.eventCount += 1;
    bucket.orgIds.add(r.orgId);
    byProduct.set(r.product, bucket);
  }

  const qualifying = [...byProduct.entries()]
    .filter(([, b]) => b.orgIds.size >= MIN_ORGS_PER_ARM)
    .map(([product, b]) => ({ product, avgDays: b.totalDays / b.eventCount, orgCount: b.orgIds.size }))
    .sort((x, y) => x.avgDays - y.avgDays);

  if (qualifying.length < 2 || qualifying[0].avgDays === qualifying[1].avgDays) return null;

  const [fastest, second] = qualifying;
  return {
    pestSpecies,
    faster: fastest,
    slower: second,
    pctFaster: Math.round(((second.avgDays - fastest.avgDays) / second.avgDays) * 100),
  };
}
