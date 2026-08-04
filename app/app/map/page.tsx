import Link from "next/link";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { facilities, facilityAreas, facilityMapObjects, pestEvents } from "@/db/schema";
import { requireGrowerSession } from "@/lib/session";
import MapEditor from "../facilities/[id]/areas/[areaId]/MapEditorClient";

const SEVERITY_RANK = { low: 0, moderate: 1, high: 2, severe: 3 } as const;
const FOLLOW_UP_AFTER_DAYS = 3;
function needsFollowUp(createdAt: Date): boolean {
  return Date.now() - createdAt.getTime() > FOLLOW_UP_AFTER_DAYS * 86_400_000;
}

// Home per the design brief: opens straight onto the most relevant site's
// map (highest current pressure), not a menu. Reuses the same MapEditor
// component the site-detail route already uses -- full editing/pin-dropping
// works here too, this is just a different entry point onto the same data,
// with a picker + a floating "what's happening at this site" summary on top.
export default async function MapHomePage({
  searchParams,
}: {
  searchParams: Promise<{ facility?: string; area?: string }>;
}) {
  const session = await requireGrowerSession();
  if (!session) return null;

  const { facility: facilityParam, area: areaParam } = await searchParams;

  const orgFacilities = await db
    .select()
    .from(facilities)
    .where(eq(facilities.organizationId, session.organizationId!));

  if (orgFacilities.length === 0) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-2xl font-semibold">Map</h1>
        <div className="card p-6 text-[var(--text-dim)]">
          No sites yet.{" "}
          <Link href="/app/facilities" className="text-[var(--accent)]">
            Add your first site
          </Link>{" "}
          to see it on the map.
        </div>
      </div>
    );
  }

  const activeEvents = await db
    .select()
    .from(pestEvents)
    .where(eq(pestEvents.status, "active"));
  const orgFacilityIds = new Set(orgFacilities.map((f) => f.id));
  const orgActiveEvents = activeEvents.filter((e) => orgFacilityIds.has(e.facilityId));

  // Default facility: the one with the highest-severity open hotspot, else
  // the first site.
  const hottestEvent = [...orgActiveEvents].sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity])[0];
  const selectedFacilityId = facilityParam ?? hottestEvent?.facilityId ?? orgFacilities[0].id;
  const selectedFacility = orgFacilities.find((f) => f.id === selectedFacilityId) ?? orgFacilities[0];

  const areas = await db.select().from(facilityAreas).where(eq(facilityAreas.facilityId, selectedFacility.id));

  const facilityEvents = orgActiveEvents.filter((e) => e.facilityId === selectedFacility.id);
  const facilityFollowUps = facilityEvents.filter((e) => needsFollowUp(e.createdAt));

  if (areas.length === 0) {
    return (
      <div className="flex flex-col gap-6">
        <FacilityPicker facilities={orgFacilities} selectedId={selectedFacility.id} />
        <div className="card p-6 text-[var(--text-dim)]">
          {selectedFacility.name} has no areas yet.{" "}
          <Link href={`/app/facilities/${selectedFacility.id}`} className="text-[var(--accent)]">
            Add a room or greenhouse
          </Link>{" "}
          to draw its layout.
        </div>
      </div>
    );
  }

  const hottestAreaEvent = [...facilityEvents].sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity])[0];
  const selectedAreaId = areaParam ?? hottestAreaEvent?.facilityAreaId ?? areas[0].id;
  const selectedArea = areas.find((a) => a.id === selectedAreaId) ?? areas[0];

  const objects = await db.select().from(facilityMapObjects).where(eq(facilityMapObjects.facilityAreaId, selectedArea.id));
  const areaPestEvents = await db
    .select()
    .from(pestEvents)
    .where(and(eq(pestEvents.facilityAreaId, selectedArea.id)));

  return (
    <div className="flex flex-col gap-4">
      <FacilityPicker facilities={orgFacilities} selectedId={selectedFacility.id} />

      {areas.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {areas.map((a) => (
            <Link
              key={a.id}
              href={`/app/map?facility=${selectedFacility.id}&area=${a.id}`}
              className={`rounded-full px-3 py-1.5 text-sm ${
                a.id === selectedArea.id ? "bg-[var(--accent)] text-[#0B1626]" : "card text-[var(--text-dim)]"
              }`}
            >
              {a.name}
            </Link>
          ))}
        </div>
      )}

      <div className="card flex items-center justify-between p-3 text-sm">
        <span>{selectedFacility.name}</span>
        <span className="text-[var(--text-dim)]">
          {facilityEvents.length} open hotspot{facilityEvents.length === 1 ? "" : "s"} -- {facilityFollowUps.length} follow-up
          {facilityFollowUps.length === 1 ? "" : "s"} due
        </span>
      </div>

      <MapEditor
        facilityId={selectedFacility.id}
        area={{
          id: selectedArea.id,
          name: selectedArea.name,
          backgroundImageUrl: selectedArea.backgroundImageUrl,
          backgroundScale: selectedArea.backgroundScale,
        }}
        initialObjects={objects.map((o) => ({
          id: o.id,
          shapeType: o.shapeType,
          geometry: o.geometry as never,
          style: o.style as never,
          label: o.label,
          zIndex: o.zIndex,
        }))}
        initialPestEvents={areaPestEvents.map((ev) => ({
          id: ev.id,
          x: ev.x,
          y: ev.y,
          pestSpecies: ev.pestSpecies,
          severity: ev.severity,
          status: ev.status,
          notes: ev.notes,
        }))}
      />
    </div>
  );
}

function FacilityPicker({ facilities, selectedId }: { facilities: { id: string; name: string }[]; selectedId: string }) {
  if (facilities.length <= 1) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {facilities.map((f) => (
        <Link
          key={f.id}
          href={`/app/map?facility=${f.id}`}
          className={`rounded-full px-3 py-1.5 text-sm ${f.id === selectedId ? "bg-[var(--accent)] text-[#0B1626]" : "card text-[var(--text-dim)]"}`}
        >
          {f.name}
        </Link>
      ))}
    </div>
  );
}
