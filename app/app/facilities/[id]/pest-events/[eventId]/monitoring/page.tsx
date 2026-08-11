import Link from "next/link";
import { notFound } from "next/navigation";
import { getOwnedFacility } from "@/lib/facilities";
import { getOwnedPestEvent } from "@/lib/pest-events";
import { requireGrowerSession } from "@/lib/session";
import CountsFlow from "../../../../../CountsFlow";
import MethodChoice from "../../../../../MethodChoice";
import MonitoringFlow from "./MonitoringFlow";

export default async function MonitoringPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; eventId: string }>;
  searchParams: Promise<{ method?: string; taskId?: string }>;
}) {
  const session = await requireGrowerSession();
  if (!session) return null;

  const { id, eventId } = await params;
  const { method, taskId } = await searchParams;
  const facility = await getOwnedFacility(id, session.organizationId!);
  if (!facility) notFound();

  const event = await getOwnedPestEvent(id, eventId, session.organizationId!);
  if (!event) notFound();

  const postUrl = `/api/facilities/${id}/pest-events/${eventId}/monitoring`;
  const redirectHref = `/app/facilities/${id}/pest-events/${eventId}`;

  if (!method) {
    return (
      <div className="mx-auto flex max-w-md flex-col gap-4">
        <Link href={redirectHref} className="text-sm text-[var(--text-dim)]">
          ← {event.pestSpecies}
        </Link>
        <MethodChoice
          baseHref={`/app/facilities/${id}/pest-events/${eventId}/monitoring${taskId ? `?taskId=${taskId}` : ""}`}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-md flex-col gap-6">
      <Link href={redirectHref} className="text-sm text-[var(--text-dim)]">
        ← {event.pestSpecies}
      </Link>
      {method === "counts" ? (
        <CountsFlow postUrl={postUrl} redirectHref={redirectHref} taskId={taskId} />
      ) : (
        <MonitoringFlow postUrl={postUrl} redirectHref={redirectHref} isPilotTier={session.accountTier === "pilot"} taskId={taskId} />
      )}
    </div>
  );
}
