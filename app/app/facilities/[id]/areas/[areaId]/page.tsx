import Link from "next/link";
import { and, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { facilityAreas, facilityMapObjects, pestEvents } from "@/db/schema";
import { getOwnedFacility } from "@/lib/facilities";
import { computeEventSignals } from "@/lib/pest-event-signals";
import { requireGrowerSession } from "@/lib/session";
import LayoutPicker from "./LayoutPicker";
import MapEditor from "./MapEditorClient";

export default async function AreaMapPage({ params }: { params: Promise<{ id: string; areaId: string }> }) {
  const session = await requireGrowerSession();
  if (!session) return null;

  const { id, areaId } = await params;
  const facility = await getOwnedFacility(id, session.organizationId!);
  if (!facility) notFound();

  const [area] = await db
    .select()
    .from(facilityAreas)
    .where(and(eq(facilityAreas.id, areaId), eq(facilityAreas.facilityId, id)));
  if (!area) notFound();

  const objects = await db
    .select()
    .from(facilityMapObjects)
    .where(eq(facilityMapObjects.facilityAreaId, areaId));

  const events = await db.select().from(pestEvents).where(eq(pestEvents.facilityAreaId, areaId));
  const signals = await computeEventSignals(events.map((e) => e.id));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href={`/app/facilities/${id}`} className="text-sm text-[var(--text-dim)]">
          ← {facility.name}
        </Link>
        <h1 className="text-2xl font-semibold">{area.name}</h1>
      </div>

      {objects.length === 0 && !area.backgroundImageUrl ? (
        <LayoutPicker facilityId={id} areaId={area.id} />
      ) : (
      <MapEditor
        facilityId={id}
        area={{
          id: area.id,
          name: area.name,
          backgroundImageUrl: area.backgroundImageUrl,
          backgroundScale: area.backgroundScale,
        }}
        initialObjects={objects.map((o) => ({
          id: o.id,
          shapeType: o.shapeType,
          geometry: o.geometry as never,
          style: o.style as never,
          label: o.label,
          zIndex: o.zIndex,
        }))}
        initialPestEvents={events.map((ev) => ({
          id: ev.id,
          x: ev.x,
          y: ev.y,
          pestSpecies: ev.pestSpecies,
          severity: ev.severity,
          status: ev.status,
          notes: ev.notes,
          createdAt: ev.createdAt.toISOString(),
          lastTreatedAt: signals.get(ev.id)?.lastTreatedAt ?? null,
          trend: signals.get(ev.id)?.trend ?? null,
        }))}
      />
      )}
    </div>
  );
}
