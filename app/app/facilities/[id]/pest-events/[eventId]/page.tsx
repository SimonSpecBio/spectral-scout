import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { users as authUsers } from "@/db/auth-schema";
import { facilityAreas, inventoryItems, monitoringThresholds, observationPhotos, pestEventComments, scoutingObservations, treatments } from "@/db/schema";
import { getOwnedPestEvent } from "@/lib/pest-events";
import { getOwnedFacility } from "@/lib/facilities";
import { isHomeGrower } from "@/lib/grower-type";
import { computeFollowUpSuggestions } from "@/lib/recommendations";
import { requireGrowerSession } from "@/lib/session";
import { getTeam } from "@/lib/team";
import { getSpeciesThresholds, sessionMetric } from "@/lib/threshold-engine";
import PestEventDetail from "./PestEventDetail";

export default async function PestEventPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; eventId: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const session = await requireGrowerSession();
  if (!session) return null;

  const { id, eventId } = await params;
  const { tab: initialTab } = await searchParams;
  const facility = await getOwnedFacility(id, session.organizationId!);
  if (!facility) notFound();

  const event = await getOwnedPestEvent(id, eventId, session.organizationId!);
  if (!event) notFound();

  const area = event.facilityAreaId
    ? (await db.select().from(facilityAreas).where(eq(facilityAreas.id, event.facilityAreaId)))[0]
    : null;
  // Left-joined for the per-event chart's treatment markers (Airtable
  // ticket B4, "tapping shows date/logger/product") -- null for treatments
  // logged before operatorUserId existed, or a since-deleted account, same
  // "just omit rather than show a broken name" rule as loggedByName below.
  const eventTreatments = await db
    .select({
      id: treatments.id,
      type: treatments.type,
      product: treatments.product,
      targetPest: treatments.targetPest,
      notes: treatments.notes,
      appliedAt: treatments.appliedAt,
      inventoryItemId: treatments.inventoryItemId,
      operatorName: authUsers.name,
      operatorEmail: authUsers.email,
    })
    .from(treatments)
    .leftJoin(authUsers, eq(treatments.operatorUserId, authUsers.id))
    .where(eq(treatments.pestEventId, eventId));
  // Left-joined for the Photos tab's tap-to-reveal uploader name (Airtable
  // ticket B6/B7) -- null for photos uploaded before uploadedByUserId
  // existed, or a since-deleted account; the UI shows "Unknown" for those.
  const photos = await db
    .select({
      id: observationPhotos.id,
      blobUrl: observationPhotos.blobUrl,
      caption: observationPhotos.caption,
      uploadedAt: observationPhotos.uploadedAt,
      uploaderName: authUsers.name,
      uploaderEmail: authUsers.email,
    })
    .from(observationPhotos)
    .leftJoin(authUsers, eq(observationPhotos.uploadedByUserId, authUsers.id))
    .where(eq(observationPhotos.pestEventId, eventId));
  const monitoringSessions = await db
    .select()
    .from(scoutingObservations)
    .where(eq(scoutingObservations.promotedPestEventId, eventId))
    .orderBy(desc(scoutingObservations.createdAt));
  const items = await db.select().from(inventoryItems).where(eq(inventoryItems.organizationId, session.organizationId!));
  const comments = await db
    .select({
      id: pestEventComments.id,
      body: pestEventComments.body,
      createdAt: pestEventComments.createdAt,
      authorUserId: pestEventComments.authorUserId,
      authorName: authUsers.name,
      authorEmail: authUsers.email,
    })
    .from(pestEventComments)
    .leftJoin(authUsers, eq(pestEventComments.authorUserId, authUsers.id))
    .where(eq(pestEventComments.pestEventId, eventId))
    .orderBy(pestEventComments.createdAt);
  const thresholds = await getSpeciesThresholds(session.organizationId!, event.pestSpecies);
  // Whether the numbers/mode in `thresholds` are still the catalog's own
  // research-backed default, or an org already overrode them -- the
  // confidence badge (PestEventDetail's chart, currently hidden -- see
  // SHOW_THRESHOLD_CONFIDENCE there) only means anything next to the
  // catalog's real number, not an org's own customized one, so this
  // gates whether it would render at all rather than risk it reading as
  // vouching for a value the org chose themselves.
  const hasOrgThresholdOverride = (
    await db.select().from(monitoringThresholds).where(eq(monitoringThresholds.organizationId, session.organizationId!))
  ).some((t) => t.pestSpecies.toLowerCase() === event.pestSpecies.toLowerCase());
  const locationLabel = area ? `${area.name}, ${facility.name}` : facility.name;

  // Null for events created before createdByUserId existed, or if that user
  // account was later deleted -- PestEventDetail just omits the "Logged by"
  // line rather than showing a broken/blank name in either case.
  const loggedByName = event.createdByUserId
    ? (await db.select({ name: authUsers.name, email: authUsers.email }).from(authUsers).where(eq(authUsers.id, event.createdByUserId)))[0]
    : null;

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

  // For the team-member share picker (Airtable ticket B5, replacing the
  // old external share link) -- excludes the current user, sharing with
  // yourself isn't a real action.
  const { members: teamMembers } = await getTeam(session.organizationId!);
  const shareableMembers = teamMembers.filter((m) => m.userId !== session.user!.id!);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href={area ? `/app/facilities/${id}/areas/${area.id}` : `/app/facilities/${id}`}
          className="inline-flex items-center gap-1 text-sm text-[var(--text-dim)]"
        >
          <span>←</span>
          <span>{area ? area.name : facility.name}</span>
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
          createdAt: event.createdAt.toISOString(),
          resolvedAt: event.resolvedAt ? event.resolvedAt.toISOString() : null,
          autoResolved: event.autoResolved,
          loggedBy: loggedByName ? (loggedByName.name ?? loggedByName.email) : null,
        }}
        locationLabel={locationLabel}
        mapHref={area ? `/app/facilities/${id}/areas/${area.id}` : null}
        initialTab={initialTab}
        facilityAreaId={area?.id ?? null}
        followUpSuggestions={followUpSuggestions}
        initialTreatments={eventTreatments.map((t) => ({
          id: t.id,
          type: t.type,
          product: t.product,
          targetPest: t.targetPest,
          notes: t.notes,
          appliedAt: t.appliedAt.toISOString(),
          loggedBy: t.operatorName ?? t.operatorEmail ?? null,
        }))}
        initialPhotos={photos.map((p) => ({
          id: p.id,
          blobUrl: p.blobUrl,
          caption: p.caption,
          uploadedAt: p.uploadedAt.toISOString(),
          uploadedByName: p.uploaderName ?? p.uploaderEmail ?? null,
        }))}
        initialComments={comments.map((c) => ({ ...c, createdAt: c.createdAt.toISOString() }))}
        currentUserId={session.user!.id!}
        isHomeGrower={isHomeGrower(session.growerType)}
        orgState={session.organizationState}
        isPilotTier={session.accountTier === "pilot"}
        initialMonitoring={monitoringSessions.flatMap((s) => {
          const metric = sessionMetric(s);
          return metric ? [{ id: s.id, date: s.date, metricKind: metric.kind, value: metric.value }] : [];
        })}
        inventoryItems={items.map((i) => ({
          id: i.id,
          name: i.name,
          unit: i.unit,
          quantity: Number(i.quantity),
          reorderLevel: i.reorderLevel == null ? null : Number(i.reorderLevel),
          unitCost: i.unitCost == null ? null : Number(i.unitCost),
        }))}
        thresholds={thresholds}
        showThresholdConfidence={!hasOrgThresholdOverride}
        shareableMembers={shareableMembers.map((m) => ({ userId: m.userId, name: m.name, email: m.email }))}
      />
    </div>
  );
}
