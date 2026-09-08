// Pure, DB-free -- Phase 1.2/1.4 (build-cycle doc, 2026-09-07): "one
// primary CTA" per case, and the trend refinement that primary CTA reads.
// Callers gather the raw facts (treatments exist? an open recheck task?
// the session history) and computePrimaryCta decides which single button
// the case page shows. Split out on its own so it's cheaply unit-testable
// without a database, same reasoning as lib/scout-metric.ts.

export type TrendLabel = "improving" | "worsening" | "stable" | null;

export interface TrendSignal {
  // Only set once there are >=3 real observations -- n>=3 governs the
  // WORD ("no chart theater": a one- or two-point line isn't a real
  // trend, just noise presented as one). Below that, this stays null even
  // if the two points available happen to differ.
  label: TrendLabel;
  // Can fire at n>=2, independent of `label` -- a large single-interval
  // jump (Botrytis under high RH going from trace to crop loss inside a
  // week) must still warn even though there isn't enough history yet to
  // state a real trend word. "Don't state a trend" and "don't warn" are
  // different things: withholding the label is honest, withholding the
  // warning is not.
  largeJumpWorsening: boolean;
}

export interface TrendObservation {
  kind: "occupancy" | "density";
  value: number;
  // Only present for a disease_severity session (lib/scout-metric.ts) --
  // checked as its own dimension so a severity jump warns even when
  // incidence (value) holds flat, per 0.6's "don't average the two"
  // decision extended into trend.
  severityPct?: number;
}

// A jump is "large" if it crosses a fixed number of percentage points (for
// a 0-100 scale metric) or roughly doubles (either scale) -- no single
// published threshold exists for "this pest visibly exploded," so these
// are a deliberately generous, documented judgment call rather than
// invented precision. Going from truly absent to any detection at all
// also counts: a 0 baseline can't "double."
const LARGE_JUMP_ABSOLUTE_PCT = 25;
const LARGE_JUMP_RELATIVE = 2;

function isLargeJump(prior: number, latest: number, isPctScale: boolean): boolean {
  if (latest <= prior) return false;
  if (isPctScale && latest - prior >= LARGE_JUMP_ABSOLUTE_PCT) return true;
  if (prior > 0 && latest / prior >= LARGE_JUMP_RELATIVE) return true;
  if (prior === 0 && latest > 0) return true;
  return false;
}

// `chronological` is oldest-first, same convention as PestEventDetail's
// own session ordering.
export function computeTrendSignal(chronological: TrendObservation[]): TrendSignal {
  if (chronological.length < 2) return { label: null, largeJumpWorsening: false };

  const latest = chronological[chronological.length - 1];
  const prior = chronological[chronological.length - 2];
  let largeJumpWorsening = false;
  if (latest.kind === prior.kind) {
    largeJumpWorsening = isLargeJump(prior.value, latest.value, latest.kind === "occupancy");
    if (!largeJumpWorsening && latest.severityPct != null && prior.severityPct != null) {
      largeJumpWorsening = isLargeJump(prior.severityPct, latest.severityPct, true);
    }
  }

  let label: TrendLabel = null;
  if (chronological.length >= 3) {
    const baseline = chronological[0];
    if (baseline.kind === latest.kind) {
      label = latest.value > baseline.value ? "worsening" : latest.value < baseline.value ? "improving" : "stable";
    }
  }
  return { label, largeJumpWorsening };
}

export type CtaKind = "review_recommendation" | "recheck_scheduled" | "recheck_due" | "improving" | "worsening" | "resolved";

export interface PrimaryCta {
  kind: CtaKind;
  label: string;
}

// The doc's own six states, in priority order where more than one is
// technically true at once: resolved always wins (closed loop, nothing
// left to do); worsening comes next regardless of what else is scheduled,
// since a case visibly exploding needs attention now, not on its next
// scheduled recheck; a due or upcoming recheck beats "no treatment yet"
// framing once treatment has actually started; "review recommendation"
// only shows before anything has been applied at all.
export function computePrimaryCta(input: {
  status: "active" | "resolved";
  hasAnyTreatment: boolean;
  openRecheck: { dueAt: Date } | null;
  trend: TrendSignal;
  now?: Date;
}): PrimaryCta {
  if (input.status === "resolved") return { kind: "resolved", label: "Resolved" };

  if (input.trend.label === "worsening" || input.trend.largeJumpWorsening) {
    return { kind: "worsening", label: "Review escalation" };
  }

  if (input.openRecheck) {
    const now = input.now ?? new Date();
    if (input.openRecheck.dueAt.getTime() <= now.getTime()) {
      return { kind: "recheck_due", label: "Record recheck" };
    }
    return {
      kind: "recheck_scheduled",
      label: `Recheck on ${input.openRecheck.dueAt.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`,
    };
  }

  if (!input.hasAnyTreatment) {
    return { kind: "review_recommendation", label: "Review treatment recommendation" };
  }

  // Treated, no recheck currently scheduled, not worsening -- "improving"
  // whether or not there's enough history yet to actually say so: the
  // safest default is to keep watching, never to imply more certainty
  // than the data supports.
  return { kind: "improving", label: "Continue monitoring" };
}
