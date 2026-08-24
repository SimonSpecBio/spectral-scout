import { NextRequest, NextResponse } from "next/server";
import { getBestEfficacyBenchmark } from "@/lib/benchmarks";
import { requireGrowerSession } from "@/lib/session";

// Cross-org anonymized efficacy benchmarking (ticket 83) -- unlike every
// other /api/facilities/... route, this isn't scoped to the caller's own
// facility/org: it's a pooled, aggregate-only read across all free-tier
// orgs, gated only by being a logged-in grower (any org member, not
// owner-only -- there's nothing org-identifiable in the response).
export async function GET(request: NextRequest) {
  const session = await requireGrowerSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const pestSpecies = searchParams.get("pest");
  const products = searchParams.getAll("product").filter((p) => p.trim());
  if (!pestSpecies || products.length < 2) return NextResponse.json({ error: "pest and at least 2 product params are required" }, { status: 400 });

  const benchmark = await getBestEfficacyBenchmark(pestSpecies, products);
  return NextResponse.json({ benchmark });
}
