import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { facilities, facilityAreas, pestEvents, trapReadings, traps, trapThresholds } from "@/db/schema";
import { bayLabel, nearestBay } from "@/lib/floorplan-bays";

// Falls back to this whenever an org hasn't configured a custom
// catch/day threshold for a species (see scout_trap_threshold's schema
// comment for why this is per-pest rather than a single global switch).
// 5/day is a conservative, broadly-cited sticky-card economic threshold
// ballpark for common greenhouse pests (whitefly, thrips) -- deliberately
// on the low/cautious side since a missed real trend costs more than an
// extra suggestion a scout dismisses in one tap.
export const DEFAULT_CATCH_PER_DAY_THRESHOLD = 5;

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
  const orgFacilities = await db.select().from(facilities).where(eq(facilities.organizationId, organizationId));
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

  const thresholdRows = await db.select().from(trapThresholds).where(eq(trapThresholds.organizationId, organizationId));
  const thresholdBySpecies = new Map(thresholdRows.map((t) => [t.pestSpecies.toLowerCase(), t.catchPerDayThreshold]));

  const openEvents = await db
    .select({
      id: pestEvents.id,
      facilityAreaId: pestEvents.facilityAreaId,
      pestSpecies: pestEvents.pestSpecies,
    })
    .from(pestEvents)
    .innerJoin(facilities, eq(pestEvents.facilityId, facilities.id))
    .where(and(eq(facilities.organizationId, organizationId), eq(pestEvents.status, "active")));
  const openEventByAreaSpecies = new Map(
    openEvents.filter((e) => e.facilityAreaId).map((e) => [`${e.facilityAreaId}::${e.pestSpecies.toLowerCase()}`, e.id])
  );

  const trapById = new Map(orgTraps.map((t) => [t.id, t]));
  const alerts: TrapAlert[] = [];
  for (const reading of latestByTrapSpecies.values()) {
    const trap = trapById.get(reading.trapId);
    if (!trap) continue;
    const threshold = thresholdBySpecies.get(reading.pestSpecies.toLowerCase()) ?? DEFAULT_CATCH_PER_DAY_THRESHOLD;
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
  latestReadings: { pestSpecies: string; catchPerDay: number; count: number; daysDeployed: number; at: Date; overThreshold: boolean }[];
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
  const thresholdFor = (species: string) => thresholdBySpecies.get(species.toLowerCase()) ?? DEFAULT_CATCH_PER_DAY_THRESHOLD;
  const catchPerDay = (r: { count: number; daysDeployed: number }) => (r.daysDeployed > 0 ? r.count / r.daysDeployed : r.count);

  return facilityTraps.map((trap) => {
    const readings = readingsByTrap.get(trap.id) ?? [];
    const latestBySpecies = new Map<string, (typeof readings)[number]>();
    for (const r of readings) {
      const key = r.pestSpecies.toLowerCase();
      if (!latestBySpecies.has(key)) latestBySpecies.set(key, r);
    }
    const latestReadings = [...latestBySpecies.values()].map((r) => ({
      pestSpecies: r.pestSpecies,
      catchPerDay: catchPerDay(r),
      count: r.count,
      daysDeployed: r.daysDeployed,
      at: r.createdAt,
      overThreshold: catchPerDay(r) >= thresholdFor(r.pestSpecies),
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
