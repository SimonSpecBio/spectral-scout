import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { organizations, pestEvents, tasks } from "@/db/schema";
import { getOwnedFacility } from "@/lib/facilities";

// Atomic per-org sequential number -- a single UPDATE...RETURNING is
// atomic under Postgres's own row-level locking (same race-safe pattern
// as lib/apply-treatment.ts's inventory decrement), so two concurrent
// event creations for the same org can never receive the same number.
// Callers pass the transaction they're already inserting the pest event
// in, not the top-level `db`, so the number and the row it's for commit
// or roll back together.
export async function assignCaseNumber(tx: { update: typeof db.update }, organizationId: string): Promise<number> {
  const [row] = await tx
    .update(organizations)
    .set({ nextCaseNumber: sql`${organizations.nextCaseNumber} + 1` })
    .where(eq(organizations.id, organizationId))
    .returning({ nextCaseNumber: organizations.nextCaseNumber });
  return row.nextCaseNumber - 1;
}

// Shared by every route nested under a pest event (the event itself,
// treatments, photos) -- confirms the event exists AND belongs to the
// caller's org via its facility, not just that the id parses.
export async function getOwnedPestEvent(facilityId: string, eventId: string, organizationId: string) {
  const facility = await getOwnedFacility(facilityId, organizationId);
  if (!facility) return null;
  const [event] = await db
    .select()
    .from(pestEvents)
    .where(and(eq(pestEvents.id, eventId), eq(pestEvents.facilityId, facilityId)));
  return event ?? null;
}

// Shared by the manual "Mark resolved" PATCH route and maybeAutoResolve
// (lib/threshold-engine.ts) -- resolving an event, whichever way it
// happens, cancels its outstanding auto_program follow-ups (SCHEDULING.md:
// "resolving an event cancels its outstanding recurring release/monitor
// tasks") the same way either time, so that behavior can't drift between
// the two call sites.
export async function resolvePestEvent(eventId: string, { auto = false }: { auto?: boolean } = {}) {
  const [row] = await db
    .update(pestEvents)
    .set({ status: "resolved", resolvedAt: new Date(), autoResolved: auto })
    .where(eq(pestEvents.id, eventId))
    .returning();
  await db.delete(tasks).where(and(eq(tasks.pestEventId, eventId), eq(tasks.source, "auto_program"), eq(tasks.status, "open")));
  return row;
}
