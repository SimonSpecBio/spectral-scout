import Link from "next/link";
import { buildPickerFacilities } from "@/lib/location-picker-data";
import { requireGrowerSession } from "@/lib/session";
import ScoutingCapture from "../ScoutingCapture";

// Routine scouting, reached from the global "+". Method comes first (it
// determines which form to fill, same idea as the form-first pattern
// everywhere else), then the form itself, then site + area + bay all get
// picked together on one swipeable map screen -- no site/area list-picker
// pages up front anymore.
export default async function NewObservationPage({
  searchParams,
}: {
  searchParams: Promise<{ taskId?: string; facilityId?: string; areaId?: string }>;
}) {
  const session = await requireGrowerSession();
  if (!session) return null;

  const { taskId, facilityId: presetFacilityId, areaId: presetAreaId } = await searchParams;

  const pickerFacilities = await buildPickerFacilities(session.organizationId!);

  if (pickerFacilities.length === 0) {
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

  return (
    <ScoutingCapture
      header={<h1 className="text-2xl font-semibold">New observation</h1>}
      facilities={pickerFacilities}
      redirectHref="/app"
      isPilotTier={session.accountTier === "pilot"}
      taskId={taskId}
      presetFacilityId={presetFacilityId}
      presetAreaId={presetAreaId}
    />
  );
}
