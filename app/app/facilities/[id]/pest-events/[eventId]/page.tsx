import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { facilityAreas, inventoryItems, observationPhotos, scoutingObservations, treatments } from "@/db/schema";
import { getOwnedPestEvent } from "@/lib/pest-events";
import { getOwnedFacility } from "@/lib/facilities";
import { computeFollowUpSuggestions } from "@/lib/recommendations";
import { requireGrowerSession } from "@/lib/session";
import { getSpeciesThreshold } from "@/lib/threshold-engine";
import PestEventDetail from "./PestEventDetail";

export default async function PestEventPage({ params }: { params: Promise<{ id: string; eventId: string }> }) {
  const session = await requireGrowerSession();
  if (!session) return null;

  const { id, eventId } = await params;
  const facility = await getOwnedFacility(id, session.organizationId!);
  if (!facility) notFound();

  const event = await getOwnedPestEvent(id, eventId, session.organizationId!);
  if (!event) notFound();

  const area = event.facilityAreaId
    ? (await db.select().from(facilityAreas).where(eq(facilityAreas.id, event.facilityAreaId)))[0]
    : null;
  const eventTreatments = await db.select().from(treatments).where(eq(treatments.pestEventId, eventId));
  const photos = await db.select().from(observationPhotos).where(eq(observationPhotos.pestEventId, eventId));
  const monitoringSessions = await db
    .select()
    .from(scoutingObservations)
    .where(eq(scoutingObservations.promotedPestEventId, eventId))
    .orderBy(desc(scoutingObservations.createdAt));
  const items = await db.select().from(inventoryItems).where(eq(inventoryItems.organizationId, session.organizationId!));
  const threshold = await getSpeciesThreshold(session.organizationId!, event.pestSpecies);
  const locationLabel = area ? `${area.name}, ${facility.name}` : facility.name;

  // "After an event auto-resolves, don't just go quiet" -- only computed
  // for the auto-resolve case (manual resolve means the grower already
  // knows and closed it deliberately, same distinction the notification
  // makes). usedInventoryItems is whatever this event's treatments drew
  // from, so the restock suggestion is grounded in what was actually used.
  const followUpSuggestions =
    event.status === "resolved" && event.autoResolved
      ? computeFollowUpSuggestions({
          pestSpecies: event.pestSpecies,
          locationLabel,
          usedInventoryItems: items
            .filter((i) => eventTreatments.some((t) => t.inventoryItemId === i.id))
            .map((i) => ({ id: i.id, name: i.name, quantity: Number(i.quantity), reorderLevel: i.reorderLevel == null ? null : Number(i.reorderLevel) })),
        })
      : [];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href={area ? `/app/facilities/${id}/areas/${area.id}` : `/app/facilities/${id}`}
          className="text-sm text-[var(--text-dim)]"
        >
          ← {area ? area.name : facility.name}
        </Link>
      </div>

      <PestEventDetail
        facilityId={id}
        event={{
          id: event.id,
          kind: event.kind,
          pestSpecies: event.pestSpecies,
          scientificName: event.scientificName,
          severity: event.severity,
          status: event.status,
          notes: event.notes,
          createdAt: event.createdAt.toISOString(),
          resolvedAt: event.resolvedAt ? event.resolvedAt.toISOString() : null,
          autoResolved: event.autoResolved,
        }}
        locationLabel={locationLabel}
        mapHref={area ? `/app/facilities/${id}/areas/${area.id}` : null}
        facilityAreaId={area?.id ?? null}
        followUpSuggestions={followUpSuggestions}
        initialTreatments={eventTreatments.map((t) => ({
          id: t.id,
          type: t.type,
          product: t.product,
          targetPest: t.targetPest,
          notes: t.notes,
          appliedAt: t.appliedAt.toISOString(),
        }))}
        initialPhotos={photos.map((p) => ({ id: p.id, blobUrl: p.blobUrl, caption: p.caption }))}
        initialMonitoring={monitoringSessions.map((s) => ({
          id: s.id,
          date: s.date,
          sampleSize: s.sampleSize ?? 0,
          pestCount: s.pestCount ?? 0,
        }))}
        inventoryItems={items.map((i) => ({
          id: i.id,
          name: i.name,
          unit: i.unit,
          quantity: Number(i.quantity),
          reorderLevel: i.reorderLevel == null ? null : Number(i.reorderLevel),
        }))}
        threshold={threshold}
      />
    </div>
  );
}
