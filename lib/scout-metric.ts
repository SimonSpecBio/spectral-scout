// Pure, DB-free metric logic split out of lib/threshold-engine.ts so client
// components (PestEventDetail.tsx) can import the labeling/classification
// helpers without pulling in threshold-engine's `db` import -- and with it
// the `pg` package, which fails to bundle for the browser (no Node `dns`
// module). Anything here must stay free of `@/db` and other server-only
// imports; the DB-touching threshold lookups/alerts stay in
// threshold-engine.ts, which re-exports these for server-side callers.

// Falls back to this whenever an org hasn't set a custom threshold for a
// species -- lands near the middle of the real figures in
// treatments.json's exampleThreshold text (TSSM "10-15%", aphid "5-10%
// plants"), a reasonable general default across the catalog rather than a
// number invented from nothing. Applies to OCCUPANCY sessions only
// (leafGrid present -- Plant sampling, disease assessment): see
// sessionMetric below for why Counts sessions use a different metric and
// threshold entirely.
export const DEFAULT_INFESTED_PCT_THRESHOLD = 15;

// Counts' pestCount is a raw bug tally, not an infested-leaf count, so its
// natural unit is mean pests per leaf (sample unit), not a percentage --
// see monitoringThresholds' schema comment for the bug this replaced.
// 3/leaf is a deliberately generic middle ground across common greenhouse
// soft-bodied pests (aphids, mites, etc.), where general IPM action-
// threshold guidance mostly clusters in the 2-5-per-leaf range before
// treatment is warranted -- customizable per species (densityThreshold)
// the same way the occupancy default already is.
export const DEFAULT_DENSITY_THRESHOLD = 3;

export type MetricKind = "occupancy" | "density";

export interface SessionMetric {
  kind: MetricKind;
  value: number;
}

// The one place that decides which metric a session's raw sampleSize/
// pestCount actually means. leafGrid present => a real per-leaf grid was
// walked (Plant sampling, disease severity), so pestCount is a count of
// infested leaves out of sampleSize checked -- a true 0-100 occupancy
// percentage. leafGrid null => Counts' quick tally, where pestCount is a
// raw bug count that can exceed sampleSize -- reduces to mean pests per
// leaf instead. Every threshold/alert function in threshold-engine.ts
// reads a session's metric through this instead of assuming one shape, so
// the two methods can never again get compared on the wrong scale.
export function sessionMetric(session: { sampleSize: number | null; pestCount: number | null; leafGrid: unknown }): SessionMetric | null {
  if (!session.sampleSize) return null;
  const pestCount = session.pestCount ?? 0;
  if (session.leafGrid != null) {
    return { kind: "occupancy", value: Math.round((pestCount / session.sampleSize) * 100) };
  }
  return { kind: "density", value: Math.round((pestCount / session.sampleSize) * 10) / 10 };
}

export function metricLabel(metric: SessionMetric): string {
  return metric.kind === "occupancy" ? `${metric.value}% infested` : `${metric.value} pests/leaf`;
}

export interface SpeciesThresholds {
  pct: number;
  density: number;
  // Resolved (catalog default, then org override) presence-triggered flag
  // -- see lib/treatments-catalog.ts's PestProgram.presenceTriggered
  // comment. When true, pct/density are meaningless for comparison (any
  // detection at all is over threshold); still populated so callers that
  // only display a number don't need a separate null-handling path.
  presenceTriggered: boolean;
}

export function thresholdFor(metric: SessionMetric, thresholds: SpeciesThresholds): number {
  return metric.kind === "occupancy" ? thresholds.pct : thresholds.density;
}

// The one place that decides "is this reading bad enough to alert on."
// Every threshold/alert function in threshold-engine.ts reads through this
// instead of comparing metric.value against a numeric threshold directly,
// so a presence-triggered species (mealybug, broad mite, whitefly,
// botrytis -- lib/treatments-catalog.ts) can't be silently re-broken by a
// future caller re-implementing the comparison against pct/density.
export function isOverThreshold(metric: SessionMetric, thresholds: SpeciesThresholds): boolean {
  return thresholds.presenceTriggered ? metric.value > 0 : metric.value >= thresholdFor(metric, thresholds);
}
