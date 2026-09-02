import Link from "next/link";
import { notFound } from "next/navigation";
import { getOwnedFacility } from "@/lib/facilities";
import { getOwnedPestEvent } from "@/lib/pest-events";
import { requireGrowerSession } from "@/lib/session";
import { displayNameForPestSpecies } from "@/lib/treatments-catalog";
import ScoutingCapture from "../../../../../ScoutingCapture";
import type { ScoutingMethod } from "../../../../../MethodChoice";
import DiseaseMonitoringFlow from "./DiseaseMonitoringFlow";

const VALID_METHODS: ScoutingMethod[] = ["plant_sampling", "counts"];

export default async function MonitoringPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; eventId: string }>;
  searchParams: Promise<{ taskId?: string; method?: string }>;
}) {
  const session = await requireGrowerSession();
  if (!session) return null;

  const { id, eventId } = await params;
  const { taskId, method } = await searchParams;
  const initialMethod = VALID_METHODS.find((m) => m === method);
  const facility = await getOwnedFacility(id, session.organizationId!);
  if (!facility) notFound();

  const event = await getOwnedPestEvent(id, eventId, session.organizationId!);
  if (!event) notFound();

  const postUrl = `/api/facilities/${id}/pest-events/${eventId}/monitoring`;
  const redirectHref = `/app/facilities/${id}/pest-events/${eventId}`;

  // Pathogen events skip MethodChoice/ScoutingCapture entirely -- "Counts"
  // and "Plant sampling" are both pest presence/density methods, neither of
  // which fits a disease's % leaf-area severity scale (ticket C1).
  if (event.kind === "pathogen") {
    return (
      <div className="mx-auto flex w-full max-w-md flex-col gap-6">
        <Link href={redirectHref} className="text-sm text-[var(--text-dim)]">
          ← {displayNameForPestSpecies(event.pestSpecies)}
        </Link>
        <DiseaseMonitoringFlow postUrl={postUrl} redirectHref={redirectHref} taskId={taskId} />
      </div>
    );
  }

  return (
    <ScoutingCapture
      header={
        <Link href={redirectHref} className="text-sm text-[var(--text-dim)]">
          ← {displayNameForPestSpecies(event.pestSpecies)}
        </Link>
      }
      postUrl={postUrl}
      redirectHref={redirectHref}
      isPilotTier={session.accountTier === "pilot"}
      taskId={taskId}
      initialMethod={initialMethod}
    />
  );
}
