import Link from "next/link";
import { notFound } from "next/navigation";
import { getOwnedFacility } from "@/lib/facilities";
import { getOwnedPestEvent } from "@/lib/pest-events";
import { requireGrowerSession } from "@/lib/session";
import MonitoringFlow from "./MonitoringFlow";

export default async function MonitoringPage({ params }: { params: Promise<{ id: string; eventId: string }> }) {
  const session = await requireGrowerSession();
  if (!session) return null;

  const { id, eventId } = await params;
  const facility = await getOwnedFacility(id, session.organizationId!);
  if (!facility) notFound();

  const event = await getOwnedPestEvent(id, eventId, session.organizationId!);
  if (!event) notFound();

  return (
    <div className="mx-auto flex max-w-md flex-col gap-6">
      <Link href={`/app/facilities/${id}/pest-events/${eventId}`} className="text-sm text-[var(--text-dim)]">
        ← {event.pestSpecies}
      </Link>
      <MonitoringFlow
        postUrl={`/api/facilities/${id}/pest-events/${eventId}/monitoring`}
        redirectHref={`/app/facilities/${id}/pest-events/${eventId}`}
      />
    </div>
  );
}
