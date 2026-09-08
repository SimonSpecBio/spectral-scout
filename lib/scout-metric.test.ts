import { describe, expect, it } from "vitest";
import { crossedDimensions, isOverThreshold, sessionMetric, thresholdFor, type SpeciesThresholds } from "./scout-metric";

// The threshold engine's whole job is deciding whether a session is bad
// enough to alert on -- a wrong answer here means a real infestation goes
// unflagged, or a grower gets spammed for nothing. sessionMetric is "the
// one place that decides which metric a session's raw sampleSize/pestCount
// actually means" per its own comment; isOverThreshold is the one place
// that decides whether that reading crosses the line.

describe("sessionMetric", () => {
  it("returns null for a session with no sample", () => {
    expect(sessionMetric({ sampleSize: 0, pestCount: 5, leafGrid: null })).toBeNull();
    expect(sessionMetric({ sampleSize: null, pestCount: 5, leafGrid: null })).toBeNull();
  });

  it("computes occupancy (%) for a pest_count session with a leafGrid (Plant sampling), never density", () => {
    const m = sessionMetric({ sampleSize: 20, pestCount: 5, leafGrid: [[]] });
    expect(m).toEqual({ kind: "occupancy", value: 25 });
  });

  it("computes density (pests/leaf) for a pest_count session with no leafGrid (Counts), even if pestCount exceeds sampleSize", () => {
    // A Counts tally's pestCount is a raw bug count, not an infested-leaf
    // count -- it can legitimately exceed sampleSize (30 mites on 5 leaves).
    const m = sessionMetric({ sampleSize: 5, pestCount: 30, leafGrid: null });
    expect(m).toEqual({ kind: "density", value: 6 });
  });

  it("treats a missing pestCount as zero, not a crash", () => {
    expect(sessionMetric({ sampleSize: 10, pestCount: null, leafGrid: null })).toEqual({ kind: "density", value: 0 });
  });

  it("a pest_count session is entirely unaffected by assessmentType/severity plumbing", () => {
    const m = sessionMetric({ sampleSize: 20, pestCount: 5, leafGrid: [[]], assessmentType: "pest_count", meanSeverityPct: 99 });
    expect(m).toEqual({ kind: "occupancy", value: 25 }); // no severityPct leaks in
  });

  it("a disease_severity session yields incidence (occupancy) AND severityPct together, never averaged", () => {
    const m = sessionMetric({ sampleSize: 30, pestCount: 6, leafGrid: [[]], assessmentType: "disease_severity", meanSeverityPct: 40 });
    expect(m).toEqual({ kind: "occupancy", value: 20, severityPct: 40 });
  });

  it("a disease_severity session with no severity data yet defaults severityPct to 0, not undefined", () => {
    const m = sessionMetric({ sampleSize: 10, pestCount: 2, leafGrid: [[]], assessmentType: "disease_severity", meanSeverityPct: null });
    expect(m).toEqual({ kind: "occupancy", value: 20, severityPct: 0 });
  });
});

describe("isOverThreshold / thresholdFor / crossedDimensions", () => {
  const thresholds: SpeciesThresholds = { pct: 15, density: 3, severityPct: 25, presenceTriggered: false };
  const presenceThresholds: SpeciesThresholds = { pct: 15, density: 3, severityPct: 25, presenceTriggered: true };

  it("compares occupancy against pct, density against density -- never the wrong scale", () => {
    expect(thresholdFor({ kind: "occupancy", value: 0 }, thresholds)).toBe(15);
    expect(thresholdFor({ kind: "density", value: 0 }, thresholds)).toBe(3);
  });

  it("is over threshold at or above the boundary, not only strictly above", () => {
    expect(isOverThreshold({ kind: "occupancy", value: 15 }, thresholds)).toBe(true);
    expect(isOverThreshold({ kind: "occupancy", value: 14 }, thresholds)).toBe(false);
  });

  it("a presence-triggered species alerts on any detection at all, ignoring pct/density entirely", () => {
    // Below the normal 15% threshold -- would read as fine for a non-
    // presence-triggered species, but must still alert here.
    expect(isOverThreshold({ kind: "occupancy", value: 1 }, presenceThresholds)).toBe(true);
    expect(isOverThreshold({ kind: "occupancy", value: 0 }, presenceThresholds)).toBe(false);
  });

  // Phase 0.6 (build-cycle doc, 2026-09-07): "severity moves the engine,
  // not just the screen." A case where the same number of leaves are
  // infected but each is twice as bad must alert, even though incidence
  // alone reads as flat/under threshold.
  it("severity crosses while incidence holds flat -- still over threshold", () => {
    const metric = { kind: "occupancy" as const, value: 5, severityPct: 30 }; // 5% incidence (fine), 30% severity (over 25%)
    expect(isOverThreshold(metric, thresholds)).toBe(true);
    expect(crossedDimensions(metric, thresholds)).toEqual(["severity"]);
  });

  it("incidence crosses while severity holds -- still over threshold", () => {
    const metric = { kind: "occupancy" as const, value: 20, severityPct: 5 }; // 20% incidence (over 15%), 5% severity (fine)
    expect(isOverThreshold(metric, thresholds)).toBe(true);
    expect(crossedDimensions(metric, thresholds)).toEqual(["incidence"]);
  });

  it("both dimensions crossing at once names both, not just one", () => {
    const metric = { kind: "occupancy" as const, value: 20, severityPct: 30 };
    expect(isOverThreshold(metric, thresholds)).toBe(true);
    expect(crossedDimensions(metric, thresholds)).toEqual(["incidence", "severity"]);
  });

  it("neither dimension crossing is not an alert", () => {
    const metric = { kind: "occupancy" as const, value: 5, severityPct: 5 };
    expect(isOverThreshold(metric, thresholds)).toBe(false);
    expect(crossedDimensions(metric, thresholds)).toEqual([]);
  });

  it("a presence-triggered species is unaffected by severityPct -- any detection is the only trigger", () => {
    const metric = { kind: "occupancy" as const, value: 0, severityPct: 99 }; // severity way over, but zero incidence
    expect(isOverThreshold(metric, presenceThresholds)).toBe(false);
    expect(crossedDimensions(metric, presenceThresholds)).toEqual([]);
  });

  it("a pest_count metric (no severityPct at all) is judged on incidence/density alone", () => {
    const metric = { kind: "density" as const, value: 5 }; // over the density threshold of 3
    expect(isOverThreshold(metric, thresholds)).toBe(true);
    expect(crossedDimensions(metric, thresholds)).toEqual(["incidence"]);
  });
});
