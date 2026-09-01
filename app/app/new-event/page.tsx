import Link from "next/link";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { scoutingObservations } from "@/db/schema";
import { buildPickerFacilities } from "@/lib/location-picker-data";
import { requireGrowerSession } from "@/lib/session";
import { sessionMetric } from "@/lib/threshold-engine";
import NewEventForm from "./NewEventForm";

export default async function NewEventPage({
  searchParams,
}: {
  searchParams: Promise<{ facility?: string; area?: string; observationId?: string }>;
}) {
  const session = await requireGrowerSession();
  if (!session) return null;

  const { facility: presetFacilityId, area: presetAreaId, observationId } = await searchParams;

  // Client-supplied like every other cross-referenced id -- verify it
  // actually belongs to this org before trusting the handoff data (or
  // writing back to it on submit). A bad/foreign id just means no handoff
  // prefill, not an error -- the form still works as a normal blank one.
  const handoffObservation = observationId
    ? (
        await db
          .select()
          .from(scoutingObservations)
          .where(and(eq(scoutingObservations.id, observationId), eq(scoutingObservations.organizationId, session.organizationId!)))
      )[0]
    : null;

  const pickerFacilities = await buildPickerFacilities(session.organizationId!);

  if (pickerFacilities.length === 0) {
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

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-6">
      <h1 className="text-2xl font-semibold">New pest event</h1>
      <NewEventForm
        facilities={pickerFacilities}
        presetFacilityId={presetFacilityId}
        presetAreaId={presetAreaId}
        handoff={
          handoffObservation
            ? {
                observationId: handoffObservation.id,
                x: handoffObservation.x,
                y: handoffObservation.y,
                sampleSize: handoffObservation.sampleSize ?? 0,
                pestCount: handoffObservation.pestCount ?? 0,
                metricKind: sessionMetric(handoffObservation)?.kind ?? "occupancy",
              }
            : null
        }
      />
    </div>
  );
}
