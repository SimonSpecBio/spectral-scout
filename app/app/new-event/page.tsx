import Link from "next/link";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { facilities, facilityAreas } from "@/db/schema";
import { requireGrowerSession } from "@/lib/session";
import NewEventForm from "./NewEventForm";

export default async function NewEventPage({
  searchParams,
}: {
  searchParams: Promise<{ facility?: string; area?: string }>;
}) {
  const session = await requireGrowerSession();
  if (!session) return null;

  const { facility: presetFacilityId, area: presetAreaId } = await searchParams;

  const orgFacilities = await db
    .select()
    .from(facilities)
    .where(eq(facilities.organizationId, session.organizationId!));

  if (orgFacilities.length === 0) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-2xl font-semibold">New pest event</h1>
        <div className="card p-6 text-[var(--text-dim)]">
          No sites yet.{" "}
          <Link href="/app/facilities" className="text-[var(--accent)]">
            Add your first site
          </Link>{" "}
          first.
        </div>
      </div>
    );
  }

  const allAreas = await db.select().from(facilityAreas);
  const pickerFacilities = orgFacilities.map((f) => ({
    id: f.id,
    name: f.name,
    areas: allAreas.filter((a) => a.facilityId === f.id).map((a) => ({ id: a.id, name: a.name })),
  }));

  return (
    <div className="mx-auto flex max-w-md flex-col gap-6">
      <h1 className="text-2xl font-semibold">New pest event</h1>
      <NewEventForm facilities={pickerFacilities} presetFacilityId={presetFacilityId} presetAreaId={presetAreaId} />
    </div>
  );
}
