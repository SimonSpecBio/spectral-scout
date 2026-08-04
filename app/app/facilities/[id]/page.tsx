import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { facilityAreas } from "@/db/schema";
import { getOwnedFacility } from "@/lib/facilities";
import { requireGrowerSession } from "@/lib/session";
import NewAreaForm from "./NewAreaForm";

export default async function FacilityDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireGrowerSession();
  if (!session) return null;

  const { id } = await params;
  const facility = await getOwnedFacility(id, session.organizationId!);
  if (!facility) notFound();

  const areas = await db.select().from(facilityAreas).where(eq(facilityAreas.facilityId, id));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/app/facilities" className="text-sm text-[var(--text-dim)]">
          ← Sites
        </Link>
        <h1 className="text-2xl font-semibold">{facility.name}</h1>
      </div>

      <NewAreaForm facilityId={id} />

      <div className="flex flex-col gap-2">
        {areas.length === 0 && <div className="text-[var(--text-dim)]">No areas yet -- add a room or greenhouse above.</div>}
        {areas.map((area) => (
          <Link key={area.id} href={`/app/facilities/${id}/areas/${area.id}`} className="card card-interactive flex items-center justify-between p-4">
            <span>{area.name}</span>
            <span className="text-sm text-[var(--text-dim)]">{area.kind.replace("_", " ")}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
