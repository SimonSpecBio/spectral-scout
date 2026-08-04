import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { pestEvents } from "@/db/schema";
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
