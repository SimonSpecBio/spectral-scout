import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { facilities, facilityAreas, pestEvents, trapReadings, traps, trapThresholds, treatments } from "@/db/schema";
import { bayLabel, nearestBay } from "@/lib/floorplan-bays";
import { findPestProgram } from "@/lib/treatments-catalog";

const DAY_MS = 86_400_000;
function daysSince(at: Date, now: Date): number {
  return Math.max(0, Math.floor((now.getTime() - at.getTime()) / DAY_MS));
}

// Falls back to this whenever an org hasn't configured a custom
// catch/day threshold for a species AND the catalog has no sourced
// species-specific default either (see scout_trap_threshold's schema
// comment for why this is per-pest rather than a single global switch).
// 5/day is a conservative, broadly-cited sticky-card economic threshold
// ballpark for common greenhouse pests (whitefly, thrips) -- deliberately
// on the low/cautious side since a missed real trend costs more than an
// extra suggestion a scout dismisses in one tap.
export const DEFAULT_CATCH_PER_DAY_THRESHOLD = 5;

// Three-tier lookup, same pattern as lib/threshold-engine.ts's density/
// occupancy thresholds: an org's own trapThresholds row wins if set, then
// the catalog's sourced per-species default (lib/treatments-catalog.ts's
// defaultCatchPerDayThreshold -- thrips/whitefly as of 2026-09-04), then
// the flat generic default above.
function catchPerDayThresholdFor(species: string, orgThresholds: Map<string, number>): number {
  const orgOverride = orgThresholds.get(species.toLowerCase());
  if (orgOverride !== undefined) return orgOverride;
  const catalogDefault = findPestProgram(species)?.defaultCatchPerDayThreshold;
  if (catalogDefault !== undefined) return catalogDefault;
  return DEFAULT_CATCH_PER_DAY_THRESHOLD;
}

export interface TrapAlert {
  trapId: string;
  trapLabel: string;
  facilityId: string;
  facilityAreaId: string;
  pestSpecies: string;
  catchPerDay: number;
  threshold: number;
  readingAt: Date;
  /** An open Pest Event already tracks this pest in this area -- surfaced
   *  so the UI can link to it instead of raising a duplicate suggestion. */
  dedupedIntoEventId: string | null;
}

// Every trap's latest reading per pest species, compared against that
// species' threshold. Over-threshold readings become "suggestions" -- never
// auto-created Pest Events (see schema comment on scout_trap_threshold for
// why: unconfirmed auto-created events risk false-positive spam that erodes
// trust faster than a human just glancing at one extra card). When an open
// Pest Event already exists for that pest in that area, the reading is
// deduped into it (surfaced, not hidden) rather than raised as a second,
// competing suggestion for the same real-world problem.
export async function computeTrapAlerts(organizationId: string): Promise<TrapAlert[]> {
  // thresholdRows and openEvents only need organizationId, not anything
  // from orgFacilities/orgTraps -- previously awaited strictly after the
  // trap-readings chain for no real reason, adding two extra sequential
  // round trips to the dashboard's home load (Airtable ticket
  // recb3yRE0dHMociTp). Fired alongside orgFacilities instead.
  const [orgFacilities, thresholdRows, openEvents] = await Promise.all([
    db.select().from(facilities).where(eq(facilities.organizationId, organizationId)),
    db.select().from(trapThresholds).where(eq(trapThresholds.organizationId, organizationId)),
    db
      .select({
        id: pestEvents.id,
        facilityAreaId: pestEvents.facilityAreaId,
        pestSpecies: pestEvents.pestSpecies,
      })
      .from(pestEvents)
      .innerJoin(facilities, eq(pestEvents.facilityId, facilities.id))
      .where(and(eq(facilities.organizationId, organizationId), eq(pestEvents.status, "active"))),
  ]);
  if (orgFacilities.length === 0) return [];
  const orgTraps = await db
    .select()
    .from(traps)
    .where(
      inArray(
        traps.facilityId,
        orgFacilities.map((f) => f.id)
      )
    );
  if (orgTraps.length === 0) return [];

  const trapIds = orgTraps.map((t) => t.id);
  const allReadings = await db
    .select()
    .from(trapReadings)
    .where(inArray(trapReadings.trapId, trapIds))
    .orderBy(desc(trapReadings.createdAt));

  // Latest reading per (trap, species) -- rows are already newest-first.
  const latestByTrapSpecies = new Map<string, (typeof allReadings)[number]>();
  for (const r of allReadings) {
    const key = `${r.trapId}::${r.pestSpecies.toLowerCase()}`;
    if (!latestByTrapSpecies.has(key)) latestByTrapSpecies.set(key, r);
  }

  const thresholdBySpecies = new Map(thresholdRows.map((t) => [t.pestSpecies.toLowerCase(), t.catchPerDayThreshold]));
  const openEventByAreaSpecies = new Map(
    openEvents.filter((e) => e.facilityAreaId).map((e) => [`${e.facilityAreaId}::${e.pestSpecies.toLowerCase()}`, e.id])
  );

  const trapById = new Map(orgTraps.map((t) => [t.id, t]));
  const alerts: TrapAlert[] = [];
  for (const reading of latestByTrapSpecies.values()) {
    const trap = trapById.get(reading.trapId);
    if (!trap) continue;
    const threshold = catchPerDayThresholdFor(reading.pestSpecies, thresholdBySpecies);
    const catchPerDay = reading.daysDeployed > 0 ? reading.count / reading.daysDeployed : reading.count;
    if (catchPerDay < threshold) continue;

    const dedupKey = `${trap.facilityAreaId}::${reading.pestSpecies.toLowerCase()}`;
    alerts.push({
      trapId: trap.id,
      trapLabel: trap.label,
      facilityId: trap.facilityId,
      facilityAreaId: trap.facilityAreaId,
      pestSpecies: reading.pestSpecies,
      catchPerDay,
      threshold,
      readingAt: reading.createdAt,
      dedupedIntoEventId: openEventByAreaSpecies.get(dedupKey) ?? null,
    });
  }
  return alerts.sort((a, b) => b.readingAt.getTime() - a.readingAt.getTime());
}

export interface TrapStatus {
  trap: { id: string; label: string; x: number; y: number; facilityAreaId: string };
  bayLabel: string;
  latestReadings: {
    pestSpecies: string;
    catchPerDay: number;
    count: number;
    daysDeployed: number;
    at: Date;
    overThreshold: boolean;
    threshold: number;
    // Phase 2 (build-cycle doc, 2026-09-07): "previous, trend-if-enough,
    // threshold, over/under" -- the SECOND-most-recent reading for this
    // same species, for a plain before/after comparison. Null the first
    // time a species is read at this trap; there's nothing to compare yet.
    previousCatchPerDay: number | null;
    daysSinceReading: number;
    // Null when no event-scoped treatment has ever targeted this pest in
    // this trap's area -- "context if cheap": only matches treatments tied
    // to a Pest Event (whose area is already known with no zone/geometry
    // resolution needed), not standalone Application Log entries with a
    // dropped pin, which would need the heavier resolveBayLabels lookup
    // lib/rei-phi.ts uses. A real gap for the minority of areas that only
    // ever get standalone releases, accepted for this pass.
    daysSinceTreatment: number | null;
  }[];
  history: number[]; // catch/day for the trap's single most-recently-read species, oldest to newest, for a sparkline
  overThreshold: boolean;
}

// Per-trap rollup for the Traps list screen: current status per pest it's
// been read for, plus a short trend history for whichever species it was
// most recently checked against.
export async function computeTrapStatuses(facilityId: string): Promise<TrapStatus[]> {
  const facilityTraps = await db.select().from(traps).where(eq(traps.facilityId, facilityId));
  if (facilityTraps.length === 0) return [];

  const trapIds = facilityTraps.map((t) => t.id);
  const allReadings = await db
    .select()
    .from(trapReadings)
    .where(inArray(trapReadings.trapId, trapIds))
    .orderBy(desc(trapReadings.createdAt));

  const readingsByTrap = new Map<string, typeof allReadings>();
  for (const r of allReadings) {
    readingsByTrap.set(r.trapId, [...(readingsByTrap.get(r.trapId) ?? []), r]);
  }

  const orgId = (await db.select().from(facilities).where(eq(facilities.id, facilityId)))[0]?.organizationId;
  const thresholdRows = orgId ? await db.select().from(trapThresholds).where(eq(trapThresholds.organizationId, orgId)) : [];
  const thresholdBySpecies = new Map(thresholdRows.map((t) => [t.pestSpecies.toLowerCase(), t.catchPerDayThreshold]));
  const thresholdFor = (species: string) => catchPerDayThresholdFor(species, thresholdBySpecies);
  const catchPerDay = (r: { count: number; daysDeployed: number }) => (r.daysDeployed > 0 ? r.count / r.daysDeployed : r.count);
  const now = new Date();

  // "Days since treatment" (Phase 2's "context if cheap") -- only
  // event-scoped treatments, whose area is already known via their pest
  // event with no zone/geometry resolution needed (see the TrapStatus
  // comment above on why standalone Application Log entries are skipped).
  // targetPest is reliably populated even when a grower didn't type one --
  // the treatment POST route defaults it to the event's own pestSpecies.
  const areaTreatments = await db
    .select({ facilityAreaId: pestEvents.facilityAreaId, targetPest: treatments.targetPest, appliedAt: treatments.appliedAt })
    .from(treatments)
    .innerJoin(pestEvents, eq(treatments.pestEventId, pestEvents.id))
    .where(eq(pestEvents.facilityId, facilityId));
  const lastTreatmentByAreaSpecies = new Map<string, Date>();
  for (const t of areaTreatments) {
    if (!t.facilityAreaId || !t.targetPest) continue;
    const key = `${t.facilityAreaId}::${t.targetPest.toLowerCase()}`;
    const existing = lastTreatmentByAreaSpecies.get(key);
    if (!existing || t.appliedAt > existing) lastTreatmentByAreaSpecies.set(key, t.appliedAt);
  }

  return facilityTraps.map((trap) => {
    const readings = readingsByTrap.get(trap.id) ?? [];
    // All readings for the trap, grouped by species but each group still
    // newest-first (readings itself already is) -- [0] is "latest," [1]
    // is "previous," same reading this trap logged last time for this pest.
    const readingsBySpecies = new Map<string, typeof readings>();
    for (const r of readings) {
      const key = r.pestSpecies.toLowerCase();
      readingsBySpecies.set(key, [...(readingsBySpecies.get(key) ?? []), r]);
    }
    const latestReadings = [...readingsBySpecies.values()].map(([r, prev]) => ({
      pestSpecies: r.pestSpecies,
      catchPerDay: catchPerDay(r),
      count: r.count,
      daysDeployed: r.daysDeployed,
      at: r.createdAt,
      overThreshold: catchPerDay(r) >= thresholdFor(r.pestSpecies),
      threshold: thresholdFor(r.pestSpecies),
      previousCatchPerDay: prev ? catchPerDay(prev) : null,
      daysSinceReading: daysSince(r.createdAt, now),
      daysSinceTreatment: (() => {
        const appliedAt = lastTreatmentByAreaSpecies.get(`${trap.facilityAreaId}::${r.pestSpecies.toLowerCase()}`);
        return appliedAt ? daysSince(appliedAt, now) : null;
      })(),
    }));

    const mostRecentSpecies = readings[0]?.pestSpecies.toLowerCase() ?? null;
    const history = mostRecentSpecies
      ? readings
          .filter((r) => r.pestSpecies.toLowerCase() === mostRecentSpecies)
          .map(catchPerDay)
          .reverse()
      : [];

    return {
      trap: { id: trap.id, label: trap.label, x: trap.x, y: trap.y, facilityAreaId: trap.facilityAreaId },
      bayLabel: bayLabel(nearestBay(trap.x, trap.y)),
      latestReadings,
      history,
      overThreshold: latestReadings.some((r) => r.overThreshold),
    };
  });
}
