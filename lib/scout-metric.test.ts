import { describe, expect, it } from "vitest";
import { isOverThreshold, sessionMetric, thresholdFor, type SpeciesThresholds } from "./scout-metric";

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

  it("computes occupancy (%) when leafGrid is present, never density", () => {
    const m = sessionMetric({ sampleSize: 20, pestCount: 5, leafGrid: [[]] });
    expect(m).toEqual({ kind: "occupancy", value: 25 });
  });

  it("computes density (pests/leaf) when leafGrid is absent, even if pestCount exceeds sampleSize", () => {
    // A Counts tally's pestCount is a raw bug count, not an infested-leaf
    // count -- it can legitimately exceed sampleSize (30 mites on 5 leaves).
    const m = sessionMetric({ sampleSize: 5, pestCount: 30, leafGrid: null });
    expect(m).toEqual({ kind: "density", value: 6 });
  });

  it("treats a missing pestCount as zero, not a crash", () => {
    expect(sessionMetric({ sampleSize: 10, pestCount: null, leafGrid: null })).toEqual({ kind: "density", value: 0 });
  });
});

describe("isOverThreshold / thresholdFor", () => {
  const thresholds: SpeciesThresholds = { pct: 15, density: 3, presenceTriggered: false };
  const presenceThresholds: SpeciesThresholds = { pct: 15, density: 3, presenceTriggered: true };

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
});
