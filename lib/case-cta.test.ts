import { describe, expect, it } from "vitest";
import { computePrimaryCta, computeTrendSignal, type TrendObservation } from "./case-cta";

describe("computeTrendSignal", () => {
  it("says nothing at n<2 -- not enough data for a label or a jump check", () => {
    expect(computeTrendSignal([])).toEqual({ label: null, largeJumpWorsening: false });
    expect(computeTrendSignal([{ kind: "occupancy", value: 10 }])).toEqual({ label: null, largeJumpWorsening: false });
  });

  it("withholds the trend WORD below n=3 -- no chart theater off two points", () => {
    const two: TrendObservation[] = [
      { kind: "occupancy", value: 10 },
      { kind: "occupancy", value: 12 },
    ];
    expect(computeTrendSignal(two).label).toBeNull();
  });

  it("but a large single-interval jump still warns at n=2, even with no label", () => {
    const two: TrendObservation[] = [
      { kind: "occupancy", value: 5 },
      { kind: "occupancy", value: 60 }, // +55 points, way over the 25pt bar
    ];
    const signal = computeTrendSignal(two);
    expect(signal.label).toBeNull(); // withholding the label is honest
    expect(signal.largeJumpWorsening).toBe(true); // withholding the warning is not
  });

  it("a small increase at n=2 doesn't fire the warning", () => {
    const two: TrendObservation[] = [
      { kind: "occupancy", value: 10 },
      { kind: "occupancy", value: 15 },
    ];
    expect(computeTrendSignal(two).largeJumpWorsening).toBe(false);
  });

  it("states a real worsening/improving/stable label once n>=3, comparing latest against the original baseline", () => {
    const worsening: TrendObservation[] = [
      { kind: "occupancy", value: 10 },
      { kind: "occupancy", value: 12 },
      { kind: "occupancy", value: 20 },
    ];
    expect(computeTrendSignal(worsening).label).toBe("worsening");

    const improving: TrendObservation[] = [
      { kind: "occupancy", value: 20 },
      { kind: "occupancy", value: 15 },
      { kind: "occupancy", value: 10 },
    ];
    expect(computeTrendSignal(improving).label).toBe("improving");

    const stable: TrendObservation[] = [
      { kind: "occupancy", value: 10 },
      { kind: "occupancy", value: 12 },
      { kind: "occupancy", value: 10 },
    ];
    expect(computeTrendSignal(stable).label).toBe("stable");
  });

  it("a severity jump warns even while incidence (value) holds flat -- 0.6's dimensions extended into trend", () => {
    const flat: TrendObservation[] = [
      { kind: "occupancy", value: 8, severityPct: 5 },
      { kind: "occupancy", value: 8, severityPct: 60 }, // incidence unchanged, severity exploded
    ];
    const signal = computeTrendSignal(flat);
    expect(signal.largeJumpWorsening).toBe(true);
  });

  it("relative doubling counts as a large jump even under the 25-point absolute bar", () => {
    const doubled: TrendObservation[] = [
      { kind: "density", value: 3 },
      { kind: "density", value: 7 }, // more than doubled, density has no percentage-point scale
    ];
    expect(computeTrendSignal(doubled).largeJumpWorsening).toBe(true);
  });

  it("going from truly absent to any detection counts as a jump (can't divide by zero to find a ratio)", () => {
    const fromZero: TrendObservation[] = [
      { kind: "density", value: 0 },
      { kind: "density", value: 1 },
    ];
    expect(computeTrendSignal(fromZero).largeJumpWorsening).toBe(true);
  });

  it("a decrease is never a 'jump' regardless of size", () => {
    const decreasing: TrendObservation[] = [
      { kind: "occupancy", value: 80 },
      { kind: "occupancy", value: 5 },
    ];
    expect(computeTrendSignal(decreasing).largeJumpWorsening).toBe(false);
  });

  it("skips comparison across incompatible metric kinds rather than guessing", () => {
    const mixed: TrendObservation[] = [
      { kind: "density", value: 3 },
      { kind: "occupancy", value: 90 },
    ];
    expect(computeTrendSignal(mixed)).toEqual({ label: null, largeJumpWorsening: false });
  });
});

describe("computePrimaryCta", () => {
  const noTrend = { label: null, largeJumpWorsening: false } as const;

  it("resolved always wins, regardless of anything else", () => {
    const cta = computePrimaryCta({
      status: "resolved",
      hasAnyTreatment: true,
      openRecheck: { dueAt: new Date(Date.now() - 1000) },
      trend: { label: "worsening", largeJumpWorsening: true },
    });
    expect(cta.kind).toBe("resolved");
  });

  it("no treatment yet -> review the recommendation", () => {
    const cta = computePrimaryCta({ status: "active", hasAnyTreatment: false, openRecheck: null, trend: noTrend });
    expect(cta.kind).toBe("review_recommendation");
  });

  it("just treated, recheck scheduled in the future -> names the date, not 'due'", () => {
    const future = new Date(Date.now() + 3 * 86_400_000);
    const cta = computePrimaryCta({ status: "active", hasAnyTreatment: true, openRecheck: { dueAt: future }, trend: noTrend });
    expect(cta.kind).toBe("recheck_scheduled");
  });

  it("recheck due (dueAt in the past or exactly now) -> record recheck", () => {
    const past = new Date(Date.now() - 1000);
    const cta = computePrimaryCta({ status: "active", hasAnyTreatment: true, openRecheck: { dueAt: past }, trend: noTrend });
    expect(cta.kind).toBe("recheck_due");
  });

  it("worsening trend beats a scheduled (not-yet-due) recheck -- urgency wins", () => {
    const future = new Date(Date.now() + 3 * 86_400_000);
    const cta = computePrimaryCta({
      status: "active",
      hasAnyTreatment: true,
      openRecheck: { dueAt: future },
      trend: { label: "worsening", largeJumpWorsening: false },
    });
    expect(cta.kind).toBe("worsening");
  });

  it("a large-jump warning at n=2 fires the worsening CTA even with no stated trend label", () => {
    const cta = computePrimaryCta({
      status: "active",
      hasAnyTreatment: true,
      openRecheck: null,
      trend: { label: null, largeJumpWorsening: true },
    });
    expect(cta.kind).toBe("worsening");
  });

  it("improving trend, treated, nothing else pending -> continue monitoring", () => {
    const cta = computePrimaryCta({
      status: "active",
      hasAnyTreatment: true,
      openRecheck: null,
      trend: { label: "improving", largeJumpWorsening: false },
    });
    expect(cta.kind).toBe("improving");
  });
});
