import Link from "next/link";
import { and, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { facilityAreas, facilityMapObjects } from "@/db/schema";
import { getOwnedFacility } from "@/lib/facilities";
import { requireGrowerSession } from "@/lib/session";
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

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href={`/app/facilities/${id}`} className="text-sm text-[var(--text-dim)]">
          ← {facility.name}
        </Link>
        <h1 className="text-2xl font-semibold">{area.name}</h1>
      </div>

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
      />
    </div>
  );
}
