import Link from "next/link";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { facilities, facilityAreas, pestEvents } from "@/db/schema";
import { SEVERITY_COLOR } from "@/lib/colors";
import { requireGrowerSession } from "@/lib/session";

// See app/app/page.tsx's identical export for why: without this, the
// filter=/facility=-only navigation here can reuse a cached render instead
// of re-querying.
export const dynamic = "force-dynamic";

const SEVERITY_RANK = { low: 0, moderate: 1, high: 2, severe: 3 } as const;
const FOLLOW_UP_AFTER_DAYS = 3;
const DAY_MS = 86_400_000;

function needsFollowUp(createdAt: Date): boolean {
  return Date.now() - createdAt.getTime() > FOLLOW_UP_AFTER_DAYS * DAY_MS;
}

function daysOpen(createdAt: Date, resolvedAt: Date | null): number {
  return Math.floor(((resolvedAt ?? new Date()).getTime() - createdAt.getTime()) / DAY_MS);
}

const FILTERS = ["all", "open", "follow-up", "resolved"] as const;
type Filter = (typeof FILTERS)[number];

// Manager-facing scan-everything list -- default sort is urgency (open,
// high severity first), not chronology (that's Timeline's job) or
// alphabetical (this isn't a database browser).
export default async function EventsPage({ searchParams }: { searchParams: Promise<{ filter?: string }> }) {
  const session = await requireGrowerSession();
  if (!session) return null;

  const { filter: rawFilter } = await searchParams;
  const filter: Filter = FILTERS.includes(rawFilter as Filter) ? (rawFilter as Filter) : "all";

  const events = await db
    .select({
      id: pestEvents.id,
      pestSpecies: pestEvents.pestSpecies,
      severity: pestEvents.severity,
      status: pestEvents.status,
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

  const filtered = events.filter((e) => {
    if (filter === "open") return e.status === "active";
    if (filter === "follow-up") return e.status === "active" && needsFollowUp(e.createdAt);
    if (filter === "resolved") return e.status === "resolved";
    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    if (a.status !== b.status) return a.status === "active" ? -1 : 1;
    if (a.status === "active") return SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity];
    return (b.resolvedAt?.getTime() ?? 0) - (a.resolvedAt?.getTime() ?? 0);
  });

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-6">
      <h1 className="text-2xl font-semibold">Events</h1>

      <div className="flex gap-2">
        {FILTERS.map((f) => (
          <Link
            key={f}
            href={f === "all" ? "/app/events" : `/app/events?filter=${f}`}
            className={`rounded-full px-3 py-1.5 text-sm capitalize ${
              filter === f ? "bg-[var(--accent)] text-[var(--on-accent)]" : "card text-[var(--text-dim)]"
            }`}
          >
            {f === "follow-up" ? "Needs follow-up" : f}
          </Link>
        ))}
      </div>

      {sorted.length === 0 ? (
        <div className="card p-4 text-sm text-[var(--text-dim)]">No events match this filter.</div>
      ) : (
        <div className="card flex flex-col divide-y divide-[var(--border)]">
          {sorted.map((e) => (
            <Link
              key={e.id}
              href={`/app/facilities/${e.facilityId}/pest-events/${e.id}`}
              className="flex items-center justify-between gap-4 px-4 py-3 text-sm hover:bg-[var(--surface-raised)]"
            >
              <div className="flex items-center gap-3">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: SEVERITY_COLOR[e.severity] }} />
                <div>
                  <div className="font-medium capitalize">{e.pestSpecies}</div>
                  <div className="text-xs text-[var(--text-dim)]">
                    {e.areaName ? `${e.areaName}, ${e.facilityName}` : e.facilityName}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3 text-xs text-[var(--text-dim)]">
                <span className="capitalize">{e.status}</span>
                <span>{daysOpen(e.createdAt, e.resolvedAt)}d</span>
                <span className="badge capitalize" style={{ background: `${SEVERITY_COLOR[e.severity]}33`, color: SEVERITY_COLOR[e.severity] }}>
                  {e.severity}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
