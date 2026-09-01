import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { facilities, facilityAreas, facilityMapObjects } from "@/db/schema";
import type { Zone } from "@/lib/map-zones";
import type { PickerFacility } from "@/app/app/LocationPicker";

// Shared by every "fill the form, then place location" page (new-event,
// new-observation, new-treatment, new-trap, new-disease-event, log-trap-
// readings) -- previously each built this same facilities/areas shape by
// hand, which is how LocationPicker.tsx ended up always showing the
// generic lib/floorplan-bays.ts BAYS grid: none of the 6 call sites ever
// loaded an area's real facilityMapObjects to offer as real zone labels
// (Airtable ticket recwOKlHCcSyXb971). One shared builder means the real-
// zone wiring only has to happen once.
//
// Only rect/circle/polygon shapes with a label are included as zones -- a
// line or unlabeled shape isn't something a grower would recognize as "the
// place I'm standing," and lib/map-zones.ts's centroidOf has nothing
// meaningful to return for a line anyway.
export async function buildPickerFacilities(organizationId: string): Promise<PickerFacility[]> {
  const orgFacilities = await db.select().from(facilities).where(eq(facilities.organizationId, organizationId));
  const allAreas = await db.select().from(facilityAreas);
  const orgAreas = allAreas.filter((a) => orgFacilities.some((f) => f.id === a.facilityId));
  const areaIds = orgAreas.map((a) => a.id);

  const mapObjects = areaIds.length > 0 ? await db.select().from(facilityMapObjects).where(inArray(facilityMapObjects.facilityAreaId, areaIds)) : [];

  return orgFacilities.map((f) => ({
    id: f.id,
    name: f.name,
    areas: orgAreas
      .filter((a) => a.facilityId === f.id)
      .map((a) => ({
        id: a.id,
        name: a.name,
        zones: mapObjects
          .filter((o) => o.facilityAreaId === a.id && o.label && (o.shapeType === "rect" || o.shapeType === "circle" || o.shapeType === "polygon"))
          .map((o) => ({ id: o.id, label: o.label!, shapeType: o.shapeType as Zone["shapeType"], geometry: o.geometry as Zone["geometry"] })),
      })),
  }));
}
