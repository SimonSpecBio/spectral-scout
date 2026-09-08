import { describe, expect, it } from "vitest";
import { computeLookbackDays, computeRestrictionWindow } from "./rei-phi";

// REI/PHI decides whether a room is safe to enter or a crop safe to
// harvest -- a wrong answer here is a worker-safety or food-safety
// failure, not a cosmetic bug. These two functions are the pure math half
// of computeRestrictions (the DB-fetching half stays untested here per
// the ticket's own guidance -- most of this logic doesn't need a database,
// and standing one up is a bigger decision than this ticket).

describe("computeLookbackDays", () => {
  it("floors at 30 days for an org with only ordinary catalog products", () => {
    expect(computeLookbackDays(0, 0)).toBe(31); // floor + 1
    expect(computeLookbackDays(14, 24)).toBe(31); // both below the 30-day floor
  });

  it("widens past the 30-day floor for a 45-day-PHI custom product (the exact regression this replaced)", () => {
    // A fixed 30-day window used to silently drop this product's still-live
    // restriction once the treatment aged past 30 days.
    expect(computeLookbackDays(45, 0)).toBe(46);
  });

  it("widens for a long REI in hours too, converting to whole days via ceil", () => {
    // 8760 hours (the write-time cap) = 365 days exactly.
    expect(computeLookbackDays(0, 8760)).toBe(366);
    // 25 hours must round UP to 2 days, not truncate to 1 -- still under
    // the 30-day floor either way, so the floor is what actually wins here.
    expect(computeLookbackDays(0, 25)).toBe(31); // max(30, 0, 2) + 1
  });

  it("takes whichever of PHI-days or REI-hours-as-days is largest", () => {
    expect(computeLookbackDays(45, 8760)).toBe(366);
  });
});

describe("computeRestrictionWindow", () => {
  const appliedAt = new Date("2026-09-01T12:00:00.000Z");

  it("produces a null end date and inactive flag when the product carries no REI or no PHI", () => {
    const w = computeRestrictionWindow(appliedAt, null, null, appliedAt.getTime());
    expect(w).toEqual({ reiEndsAt: null, phiEndsAt: null, reiActive: false, phiActive: false });
  });

  it("is active strictly before the end boundary, inactive strictly after", () => {
    const reiHours = 24;
    const endsAt = appliedAt.getTime() + reiHours * 3_600_000;
    const before = computeRestrictionWindow(appliedAt, reiHours, null, endsAt - 1);
    const after = computeRestrictionWindow(appliedAt, reiHours, null, endsAt + 1);
    expect(before.reiActive).toBe(true);
    expect(after.reiActive).toBe(false);
  });

  it("treats the exact boundary instant as no longer active (>, not >=)", () => {
    const reiHours = 24;
    const endsAt = appliedAt.getTime() + reiHours * 3_600_000;
    expect(computeRestrictionWindow(appliedAt, reiHours, null, endsAt).reiActive).toBe(false);
  });

  it("tracks REI (hours) and PHI (days) independently -- one can be active while the other isn't", () => {
    // 12h REI (short), 3-day PHI (long) -- checked 1 day after applying.
    const oneDayLater = appliedAt.getTime() + DAY_MS();
    const w = computeRestrictionWindow(appliedAt, 12, 3, oneDayLater);
    expect(w.reiActive).toBe(false); // 12h REI has long since cleared
    expect(w.phiActive).toBe(true); // 3-day PHI is still live
  });
});

function DAY_MS(): number {
  return 86_400_000;
}
