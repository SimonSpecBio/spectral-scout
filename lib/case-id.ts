// Pure, DB-free -- split out of lib/pest-events.ts (Phase 1.7, build-cycle
// doc 2026-09-07) so client components (PestEventDetail.tsx) can format a
// case id without pulling in that file's `@/db` import and, with it, the
// `pg` package, which fails to bundle for the browser (no Node `dns`
// module) -- same reason lib/scout-metric.ts exists as its own file
// instead of living in lib/threshold-engine.ts.

// CASE-001247, not the old PE-{uuid.slice(0,4)} -- that looked like a case
// number but wasn't sequential, wasn't searchable anywhere, and collided
// at roughly 1 in 65k within an org. null (a pre-backfill straggler, or a
// row that somehow still lacks one) falls back to the old short-uuid form
// rather than showing nothing.
export function formatCaseId(caseNumber: number | null, fallbackId: string): string {
  if (caseNumber == null) return `PE-${fallbackId.slice(0, 4).toUpperCase()}`;
  return `CASE-${String(caseNumber).padStart(6, "0")}`;
}
