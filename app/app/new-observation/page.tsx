import Link from "next/link";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { facilities, facilityAreas } from "@/db/schema";
import { requireGrowerSession } from "@/lib/session";
import MonitoringFlow from "../facilities/[id]/pest-events/[eventId]/monitoring/MonitoringFlow";

// Routine scouting, reached from the global "+" -- pick a site and area,
// then the exact same tap-through protocol as event-scoped monitoring,
// just posting to the general (unlinked) scouting endpoint.
export default async function NewObservationPage({
  searchParams,
}: {
  searchParams: Promise<{ facility?: string; area?: string }>;
}) {
  const session = await requireGrowerSession();
  if (!session) return null;

  const { facility: facilityId, area: areaId } = await searchParams;

  const orgFacilities = await db
    .select()
    .from(facilities)
    .where(eq(facilities.organizationId, session.organizationId!));

  if (orgFacilities.length === 0) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-2xl font-semibold">New observation</h1>
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

  if (!facilityId) {
    return (
      <div className="mx-auto flex max-w-md flex-col gap-4">
        <h1 className="text-2xl font-semibold">New observation</h1>
        <div className="text-sm text-[var(--text-dim)]">Which site?</div>
        {orgFacilities.map((f) => (
          <Link key={f.id} href={`/app/new-observation?facility=${f.id}`} className="card card-interactive p-4">
            {f.name}
          </Link>
        ))}
      </div>
    );
  }

  const areas = await db.select().from(facilityAreas).where(eq(facilityAreas.facilityId, facilityId));

  if (!areaId) {
    if (areas.length === 0) {
      return (
        <div className="mx-auto flex max-w-md flex-col gap-4">
          <h1 className="text-2xl font-semibold">New observation</h1>
          <div className="card p-6 text-sm text-[var(--text-dim)]">
            This site has no areas yet.{" "}
            <Link href={`/app/facilities/${facilityId}`} className="text-[var(--accent)]">
              Add a room or greenhouse
            </Link>{" "}
            first.
          </div>
        </div>
      );
    }
    return (
      <div className="mx-auto flex max-w-md flex-col gap-4">
        <h1 className="text-2xl font-semibold">New observation</h1>
        <div className="text-sm text-[var(--text-dim)]">Which area?</div>
        {areas.map((a) => (
          <Link key={a.id} href={`/app/new-observation?facility=${facilityId}&area=${a.id}`} className="card card-interactive p-4">
            {a.name}
          </Link>
        ))}
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-md flex-col gap-6">
      <h1 className="text-2xl font-semibold">New observation</h1>
      <MonitoringFlow
        postUrl={`/api/facilities/${facilityId}/areas/${areaId}/scouting`}
        redirectHref="/app/today"
      />
    </div>
  );
}
