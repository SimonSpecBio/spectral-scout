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
    <div className="mx-auto flex w-full max-w-md flex-col gap-6">
      <div>
        <Link href="/app/facilities" className="text-sm text-[var(--text-dim)]">
          ← Sites
        </Link>
        <h1 className="text-2xl font-semibold">{facility.name}</h1>
      </div>

      <NewAreaForm facilityId={id} />

      {areas.length === 0 ? (
        <div className="card p-4 text-sm text-[var(--text-dim)]">No areas yet -- add a room or greenhouse above.</div>
      ) : (
        <div className="card flex flex-col divide-y divide-[var(--border)]">
          {areas.map((area) => (
            <Link
              key={area.id}
              href={`/app/facilities/${id}/areas/${area.id}`}
              className="flex items-center justify-between gap-4 px-4 py-3 text-sm hover:bg-[var(--surface-raised)]"
            >
              <span>{area.name}</span>
              <span className="text-[var(--text-dim)]">{area.kind.replace("_", " ")}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
