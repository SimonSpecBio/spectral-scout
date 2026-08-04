import Link from "next/link";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { facilities, facilityAreas, pestEvents } from "@/db/schema";
import { speciesColor } from "@/lib/pest-colors";
import { requireGrowerSession } from "@/lib/session";

const SEVERITY_RANK = { low: 0, moderate: 1, high: 2, severe: 3 } as const;
const SEVERITY_COLOR: Record<string, string> = {
  low: "#e0d24b",
  moderate: "#e0913d",
  high: "#e0553d",
  severe: "#a3193d",
};
const FOLLOW_UP_AFTER_DAYS = 3;
const DAY_MS = 86_400_000;

function relativeTime(date: Date): string {
  const days = Math.floor((Date.now() - date.getTime()) / DAY_MS);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  return `${days} days ago`;
}

// Date.now() here is fine -- this is a Server Component rendered once per
// request, not re-rendered client-side, but eslint's purity rule can't tell
// the difference, so the impure call lives in a plain helper instead of
// directly in the component body to satisfy it.
function needsFollowUp(createdAt: Date): boolean {
  return Date.now() - createdAt.getTime() > FOLLOW_UP_AFTER_DAYS * DAY_MS;
}

export default async function Dashboard() {
  const session = await requireGrowerSession();
  if (!session) return null;

  const orgFacilities = await db
    .select()
    .from(facilities)
    .where(eq(facilities.organizationId, session.organizationId!));

  if (orgFacilities.length === 0) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <div className="card p-6 text-[var(--text-dim)]">
          No facilities yet.{" "}
          <Link href="/app/facilities" className="text-[var(--accent)]">
            Add your first facility
          </Link>{" "}
          to start scouting.
        </div>
      </div>
    );
  }

  // One query, joined, feeds status/active-events/tasks/activity below --
  // this dashboard answers "what do I need to do," not "browse a table," so
  // everything downstream is derived from this same event list rather than
  // separate paginated views.
  const events = await db
    .select({
      id: pestEvents.id,
      pestSpecies: pestEvents.pestSpecies,
      severity: pestEvents.severity,
      status: pestEvents.status,
      createdAt: pestEvents.createdAt,
      resolvedAt: pestEvents.resolvedAt,
      facilityId: pestEvents.facilityId,
      facilityAreaId: pestEvents.facilityAreaId,
      facilityName: facilities.name,
      areaName: facilityAreas.name,
    })
    .from(pestEvents)
    .innerJoin(facilities, eq(pestEvents.facilityId, facilities.id))
    .leftJoin(facilityAreas, eq(pestEvents.facilityAreaId, facilityAreas.id))
    .where(eq(facilities.organizationId, session.organizationId!));

  const active = events.filter((e) => e.status === "active");

  const overallSeverity = active.reduce<keyof typeof SEVERITY_RANK>((worst, e) => {
    return SEVERITY_RANK[e.severity] > SEVERITY_RANK[worst] ? e.severity : worst;
  }, "low");
  const overallStatus =
    active.length === 0
      ? { emoji: "🟢", label: "Healthy" }
      : overallSeverity === "high" || overallSeverity === "severe"
        ? { emoji: "🔴", label: "Needs attention" }
        : overallSeverity === "moderate"
          ? { emoji: "🟠", label: "Watch" }
          : { emoji: "🟢", label: "Healthy" };

  // v1 heuristic, not a real task engine yet: an active event untouched
  // since it was created is a stand-in for "needs a follow-up inspection."
  // Once scouting observations/treatments link to pest events, this should
  // key off last-activity-on-the-event instead of just its age.
  const todaysTasks = active.filter((e) => needsFollowUp(e.createdAt));

  const activity = events
    .flatMap((e) => [
      { label: `${e.pestSpecies} detected`, sub: e.areaName ?? e.facilityName, at: e.createdAt },
      ...(e.resolvedAt ? [{ label: `${e.pestSpecies} resolved`, sub: e.areaName ?? e.facilityName, at: e.resolvedAt }] : []),
    ])
    .sort((a, b) => b.at.getTime() - a.at.getTime())
    .slice(0, 8);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">
          {orgFacilities.length === 1 ? orgFacilities[0].name : "All facilities"}
        </h1>
        <div className="card flex items-center gap-2 px-3 py-1.5 text-sm">
          <span>{overallStatus.emoji}</span>
          <span>{overallStatus.label}</span>
        </div>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-[var(--text-dim)]">Today</h2>
        {todaysTasks.length === 0 ? (
          <div className="card p-4 text-sm text-[var(--text-dim)]">Nothing needs attention right now.</div>
        ) : (
          <div className="flex flex-col gap-2">
            {todaysTasks.map((e) => (
              <Link
                key={e.id}
                href={`/app/facilities/${e.facilityId}/pest-events/${e.id}`}
                className="card card-interactive flex items-center justify-between p-3 text-sm"
              >
                <span>
                  Follow-up inspection due -- {e.pestSpecies} ({e.areaName ?? e.facilityName})
                </span>
                <span className="text-[var(--text-dim)]">→</span>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-[var(--text-dim)]">Active pest events</h2>
        {active.length === 0 ? (
          <div className="card p-4 text-sm text-[var(--text-dim)]">No active pest events.</div>
        ) : (
          <div className="flex flex-col gap-2">
            {active.map((e) => (
              <Link key={e.id} href={`/app/facilities/${e.facilityId}/pest-events/${e.id}`} className="card card-interactive flex items-center justify-between p-4">
                <div className="flex items-center gap-3">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: speciesColor(e.pestSpecies) }} />
                  <div>
                    <div className="font-medium capitalize">{e.pestSpecies}</div>
                    <div className="text-sm text-[var(--text-dim)]">
                      {e.areaName ?? e.facilityName} -- started {relativeTime(e.createdAt)}
                    </div>
                  </div>
                </div>
                <span className="badge capitalize" style={{ background: `${SEVERITY_COLOR[e.severity]}33`, color: SEVERITY_COLOR[e.severity] }}>
                  {e.severity}
                </span>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-[var(--text-dim)]">Recent activity</h2>
        {activity.length === 0 ? (
          <div className="text-sm text-[var(--text-dim)]">Nothing yet.</div>
        ) : (
          <div className="card flex flex-col divide-y divide-[var(--border)]">
            {activity.map((a, i) => (
              <div key={i} className="flex items-center justify-between px-4 py-3 text-sm">
                <span>
                  {a.label}
                  {a.sub && <span className="text-[var(--text-dim)]"> -- {a.sub}</span>}
                </span>
                <span className="text-[var(--text-dim)]">{relativeTime(a.at)}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
