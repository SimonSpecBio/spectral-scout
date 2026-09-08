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

// Phase 0.6 (build-cycle doc, 2026-09-07): a disease_severity session's
// mean-leaf-area-severity dimension, checked independently from incidence
// (DEFAULT_INFESTED_PCT_THRESHOLD). 25% lines up with the old 5-class
// disease scale's "25-50%" boundary (now collapsed into the "Medium"
// class, 2026-09-07) -- a defensible generic "this is more than trace
// damage" cutoff, not a number invented from nothing, same reasoning as
// the two defaults above.
export const DEFAULT_SEVERITY_PCT_THRESHOLD = 25;

export type MetricKind = "occupancy" | "density";

export interface SessionMetric {
  kind: MetricKind;
  value: number;
  // Only present for a disease_severity session -- the % leaf-area
  // severity dimension alongside incidence (kind/value above, which for a
  // disease session is % of leaves showing ANY damage). Checked
  // independently against its own threshold in isOverThreshold; never
  // averaged into value, since incidence and severity mean different
  // things and a grower needs to know which one moved (build-cycle doc,
  // 2026-09-07: "Do not average the two into one index").
  severityPct?: number;
}

// The one place that decides which metric(s) a session's raw sampleSize/
// pestCount/meanSeverityPct actually mean. Branches on assessmentType, not
// on leafGrid presence -- assessmentType is the authoritative field
// (db/schema.ts's own comment: it exists so a grid "can't be silently
// misread"), leafGrid presence is only used *within* the pest_count branch
// to tell Plant sampling (a real per-leaf grid, occupancy) apart from
// Counts (a raw tally, density) -- assessmentType alone can't make that
// distinction, since both share the same "pest_count" value.
//
// A disease_severity session yields BOTH an incidence value (kind:
// "occupancy", same % dimension a pest_count Plant-sampling session
// produces -- % of leaves showing any damage) and a severityPct (mean %
// leaf area across assessed leaves) riding alongside it. Every
// threshold/alert function in threshold-engine.ts reads a session's
// metric through this instead of assuming one shape, so the two methods
// (and now the two disease dimensions) can never again get compared on
// the wrong scale.
export function sessionMetric(session: {
  sampleSize: number | null;
  pestCount: number | null;
  leafGrid: unknown;
  assessmentType?: "pest_count" | "disease_severity";
  meanSeverityPct?: number | null;
}): SessionMetric | null {
  if (!session.sampleSize) return null;
  const pestCount = session.pestCount ?? 0;
  const incidencePct = Math.round((pestCount / session.sampleSize) * 100);

  if (session.assessmentType === "disease_severity") {
    return { kind: "occupancy", value: incidencePct, severityPct: session.meanSeverityPct ?? 0 };
  }
  if (session.leafGrid != null) {
    return { kind: "occupancy", value: incidencePct };
  }
  return { kind: "density", value: Math.round((pestCount / session.sampleSize) * 10) / 10 };
}

export function metricLabel(metric: SessionMetric): string {
  const primary = metric.kind === "occupancy" ? `${metric.value}% infested` : `${metric.value} pests/leaf`;
  return metric.severityPct != null ? `${primary}, ${metric.severityPct}% mean leaf area` : primary;
}

export interface SpeciesThresholds {
  pct: number;
  density: number;
  // Phase 0.6: only meaningful for a disease_severity session's
  // severityPct dimension -- unused for pest_count sessions, but always
  // populated (falls back to DEFAULT_SEVERITY_PCT_THRESHOLD) so callers
  // never need a null-handling path, same convention as pct/density.
  severityPct: number;
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
//
// A disease_severity session (metric.severityPct present) is over
// threshold if EITHER incidence or severity crosses its own threshold --
// never averaged into one index, per the build-cycle doc's explicit call.
// Presence-triggered species are unaffected by severityPct entirely: any
// detection at all already trips the alert regardless of how severe it is.
export function isOverThreshold(metric: SessionMetric, thresholds: SpeciesThresholds): boolean {
  if (thresholds.presenceTriggered) return metric.value > 0;
  const incidenceCrossed = metric.value >= thresholdFor(metric, thresholds);
  const severityCrossed = metric.severityPct != null && metric.severityPct >= thresholds.severityPct;
  return incidenceCrossed || severityCrossed;
}

// Which dimension(s) actually crossed -- for alert copy that names what
// moved, rather than a bare "over threshold" with no way to tell a grower
// whether it was incidence or severity (or, for a presence-triggered
// species, neither dimension really -- any detection at all is the trigger).
export function crossedDimensions(metric: SessionMetric, thresholds: SpeciesThresholds): ("incidence" | "severity")[] {
  if (thresholds.presenceTriggered) return metric.value > 0 ? ["incidence"] : [];
  const crossed: ("incidence" | "severity")[] = [];
  if (metric.value >= thresholdFor(metric, thresholds)) crossed.push("incidence");
  if (metric.severityPct != null && metric.severityPct >= thresholds.severityPct) crossed.push("severity");
  return crossed;
}
