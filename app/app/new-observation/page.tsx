import Link from "next/link";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { facilities, facilityAreas } from "@/db/schema";
import { requireGrowerSession } from "@/lib/session";
import CountsFlow from "../CountsFlow";
import MethodChoice from "../MethodChoice";
import MonitoringFlow from "../facilities/[id]/pest-events/[eventId]/monitoring/MonitoringFlow";

// Routine scouting, reached from the global "+". Method comes first (it
// determines which form to fill, same idea as the form-first pattern
// everywhere else), then the form itself, then site + area + bay all get
// picked together on one swipeable map screen -- no site/area list-picker
// pages up front anymore.
export default async function NewObservationPage({
  searchParams,
}: {
  searchParams: Promise<{ method?: string }>;
}) {
  const session = await requireGrowerSession();
  if (!session) return null;

  const { method } = await searchParams;

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

  if (!method) {
    return (
      <div className="mx-auto flex max-w-md flex-col gap-4">
        <h1 className="text-2xl font-semibold">New observation</h1>
        <MethodChoice baseHref="/app/new-observation" />
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
      <h1 className="text-2xl font-semibold">New observation</h1>
      {method === "counts" ? (
        <CountsFlow facilities={pickerFacilities} redirectHref="/app" />
      ) : (
        <MonitoringFlow facilities={pickerFacilities} redirectHref="/app" isPilotTier={session.accountTier === "pilot"} />
      )}
    </div>
  );
}
