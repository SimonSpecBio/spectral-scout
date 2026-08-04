import { eq } from "drizzle-orm";
import { db } from "@/db";
import { facilities } from "@/db/schema";

// Every nested facility route (areas, map objects, pest events) needs this
// same check -- confirm the facility exists AND belongs to the caller's
// org, not just that the id parses. Centralized so no route accidentally
// skips the ownership half and only checks existence.
export async function getOwnedFacility(facilityId: string, organizationId: string) {
  const [facility] = await db.select().from(facilities).where(eq(facilities.id, facilityId));
  if (!facility || facility.organizationId !== organizationId) return null;
  return facility;
}
