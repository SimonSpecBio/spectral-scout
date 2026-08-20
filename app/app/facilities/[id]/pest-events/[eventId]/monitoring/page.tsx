import Link from "next/link";
import { notFound } from "next/navigation";
import { getOwnedFacility } from "@/lib/facilities";
import { getOwnedPestEvent } from "@/lib/pest-events";
import { requireGrowerSession } from "@/lib/session";
import ScoutingCapture from "../../../../../ScoutingCapture";

export default async function MonitoringPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; eventId: string }>;
  searchParams: Promise<{ taskId?: string }>;
}) {
  const session = await requireGrowerSession();
  if (!session) return null;

  const { id, eventId } = await params;
  const { taskId } = await searchParams;
  const facility = await getOwnedFacility(id, session.organizationId!);
  if (!facility) notFound();

  const event = await getOwnedPestEvent(id, eventId, session.organizationId!);
  if (!event) notFound();

  const postUrl = `/api/facilities/${id}/pest-events/${eventId}/monitoring`;
  const redirectHref = `/app/facilities/${id}/pest-events/${eventId}`;

  return (
    <ScoutingCapture
      header={
        <Link href={redirectHref} className="text-sm text-[var(--text-dim)]">
          ← {event.pestSpecies}
        </Link>
      }
      postUrl={postUrl}
      redirectHref={redirectHref}
      isPilotTier={session.accountTier === "pilot"}
      taskId={taskId}
    />
  );
}
