import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { pestEvents, tasks } from "@/db/schema";
import { getOwnedFacility } from "@/lib/facilities";

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
