import Link from "next/link";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { facilities, facilityAreas, pestEvents, treatments } from "@/db/schema";
import { requireGrowerSession } from "@/lib/session";

// See app/app/page.tsx's identical export for why: without this, the
// facility=-only navigation here can reuse a cached render instead of
// re-querying.
export const dynamic = "force-dynamic";

function relativeTime(date: Date): string {
  const days = Math.floor((Date.now() - date.getTime()) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  return `${days} days ago`;
}

interface Entry {
  label: string;
  sub: string;
  facilityId: string;
  eventId: string;
  at: Date;
}

// Chronological, cross-facility by default -- "what happened here this
// month," not "what do I need to do" (Today) or "scan everything" (Events).
export default async function TimelinePage({ searchParams }: { searchParams: Promise<{ facility?: string }> }) {
  const session = await requireGrowerSession();
  if (!session) return null;

  const { facility: facilityFilter } = await searchParams;

  const orgFacilities = await db
    .select()
    .from(facilities)
    .where(eq(facilities.organizationId, session.organizationId!));

  const events = await db
    .select({
      id: pestEvents.id,
      pestSpecies: pestEvents.pestSpecies,
      createdAt: pestEvents.createdAt,
      resolvedAt: pestEvents.resolvedAt,
      facilityId: pestEvents.facilityId,
      facilityName: facilities.name,
      areaName: facilityAreas.name,
    })
    .from(pestEvents)
    .innerJoin(facilities, eq(pestEvents.facilityId, facilities.id))
    .leftJoin(facilityAreas, eq(pestEvents.facilityAreaId, facilityAreas.id))
    .where(eq(facilities.organizationId, session.organizationId!));

  const orgTreatments = await db
    .select({
      pestEventId: treatments.pestEventId,
      type: treatments.type,
      appliedAt: treatments.appliedAt,
    })
    .from(treatments)
    .innerJoin(facilities, eq(treatments.facilityId, facilities.id))
    .where(eq(facilities.organizationId, session.organizationId!));

  const treatmentsByEvent = new Map<string, typeof orgTreatments>();
  for (const t of orgTreatments) {
    if (!t.pestEventId) continue;
    treatmentsByEvent.set(t.pestEventId, [...(treatmentsByEvent.get(t.pestEventId) ?? []), t]);
  }

  const locationOf = (e: (typeof events)[number]) =>
    orgFacilities.length > 1 && e.areaName ? `${e.areaName}, ${e.facilityName}` : (e.areaName ?? e.facilityName);

  let entries: Entry[] = events.flatMap((e) => {
    const loc = locationOf(e);
    const list: Entry[] = [{ label: `${e.pestSpecies} detected`, sub: loc, facilityId: e.facilityId, eventId: e.id, at: e.createdAt }];
    for (const t of treatmentsByEvent.get(e.id) ?? []) {
      list.push({ label: `${t.type.replace("_", " ")} applied -- ${e.pestSpecies}`, sub: loc, facilityId: e.facilityId, eventId: e.id, at: t.appliedAt });
    }
    if (e.resolvedAt) list.push({ label: `${e.pestSpecies} resolved`, sub: loc, facilityId: e.facilityId, eventId: e.id, at: e.resolvedAt });
    return list;
  });

  if (facilityFilter) entries = entries.filter((e) => e.facilityId === facilityFilter);
  entries.sort((a, b) => b.at.getTime() - a.at.getTime());

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Timeline</h1>

      {orgFacilities.length > 1 && (
        <div className="flex flex-wrap gap-2">
          <Link href="/app/timeline" className={`rounded-full px-3 py-1.5 text-sm ${!facilityFilter ? "bg-[var(--accent)] text-[#0B1626]" : "card text-[var(--text-dim)]"}`}>
            All sites
          </Link>
          {orgFacilities.map((f) => (
            <Link
              key={f.id}
              href={`/app/timeline?facility=${f.id}`}
              className={`rounded-full px-3 py-1.5 text-sm ${facilityFilter === f.id ? "bg-[var(--accent)] text-[#0B1626]" : "card text-[var(--text-dim)]"}`}
            >
              {f.name}
            </Link>
          ))}
        </div>
      )}

      {entries.length === 0 ? (
        <div className="card p-4 text-sm text-[var(--text-dim)]">Nothing yet.</div>
      ) : (
        <div className="card flex flex-col divide-y divide-[var(--border)]">
          {entries.map((e, i) => (
            <Link
              key={i}
              href={`/app/facilities/${e.facilityId}/pest-events/${e.eventId}`}
              className="flex items-center justify-between px-4 py-3 text-sm hover:bg-[var(--surface-raised)]"
            >
              <span className="capitalize">
                {e.label}
                <span className="text-[var(--text-dim)]"> -- {e.sub}</span>
              </span>
              <span className="text-[var(--text-dim)]">{relativeTime(e.at)}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
