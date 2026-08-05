import Link from "next/link";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { facilities, facilityAreas, facilityMapObjects, pestEvents, treatments } from "@/db/schema";
import { computeEventSignals } from "@/lib/pest-event-signals";
import { requireGrowerSession } from "@/lib/session";
import MapEditor from "./facilities/[id]/areas/[areaId]/MapEditorClient";

const SEVERITY_RANK = { low: 0, moderate: 1, high: 2, severe: 3 } as const;
const SEVERITY_COLOR: Record<string, string> = {
  low: "#e0d24b",
  moderate: "#e0913d",
  high: "#e0553d",
  severe: "#a3193d",
};
const FOLLOW_UP_AFTER_DAYS = 3;
const DAY_MS = 86_400_000;

function needsFollowUp(createdAt: Date): boolean {
  return Date.now() - createdAt.getTime() > FOLLOW_UP_AFTER_DAYS * DAY_MS;
}
function relativeTime(date: Date): string {
  const days = Math.floor((Date.now() - date.getTime()) / DAY_MS);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  return `${days} days ago`;
}
// Two different facilities can both have a "Flowering Room 1" -- group by
// facility instead of just tacking the facility name onto every row.
function groupByFacility<T extends { facilityId: string; facilityName: string }>(rows: T[]): [string, T[]][] {
  const order: string[] = [];
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    if (!groups.has(row.facilityId)) {
      groups.set(row.facilityId, []);
      order.push(row.facilityId);
    }
    groups.get(row.facilityId)!.push(row);
  }
  return order.map((id) => [groups.get(id)![0].facilityName, groups.get(id)!]);
}

// The whole app in one screen, per the "mission control, not a drawing
// tool" direction: facility selector, health summary, the map itself
// (view mode by default -- editing the layout is a rare action behind its
// own button, not the default state), today's tasks, active hotspots, and
// a trimmed recent-activity feed. Map/Today/Events(preview)/Timeline
// (preview) used to be four separate tab destinations; this is what a
// grower opens every morning instead of clicking through all four.
export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ facility?: string; area?: string }>;
}) {
  const session = await requireGrowerSession();
  if (!session) return null;

  const { facility: facilityParam, area: areaParam } = await searchParams;

  const orgFacilities = await db
    .select()
    .from(facilities)
    .where(eq(facilities.organizationId, session.organizationId!));

  if (orgFacilities.length === 0) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-2xl font-semibold">Spectral Scout</h1>
        <div className="card p-6 text-[var(--text-dim)]">
          No sites yet.{" "}
          <Link href="/app/facilities" className="text-[var(--accent)]">
            Add your first site
          </Link>{" "}
          to start scouting.
        </div>
      </div>
    );
  }

  // One joined query feeds the health summary, facility/area defaulting,
  // today's tasks, and the active-hotspots list.
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

  const active = events
    .filter((e) => e.status === "active")
    .sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity]);

  const overallSeverity = active.reduce<keyof typeof SEVERITY_RANK>(
    (worst, e) => (SEVERITY_RANK[e.severity] > SEVERITY_RANK[worst] ? e.severity : worst),
    "low"
  );
  const overallStatus =
    active.length === 0
      ? { emoji: "🟢", label: "Healthy" }
      : overallSeverity === "high" || overallSeverity === "severe"
        ? { emoji: "🔴", label: "Needs attention" }
        : overallSeverity === "moderate"
          ? { emoji: "🟠", label: "Watch" }
          : { emoji: "🟢", label: "Healthy" };

  const todaysTasks = active.filter((e) => needsFollowUp(e.createdAt));

  // Recent activity: same merge Timeline uses, trimmed to a short preview
  // here -- Timeline itself is still the full, filterable version.
  const orgTreatments = await db
    .select({ pestEventId: treatments.pestEventId, type: treatments.type, appliedAt: treatments.appliedAt })
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
  const activity = events
    .flatMap((e) => {
      const loc = locationOf(e);
      const list = [{ label: `${e.pestSpecies} detected`, sub: loc, at: e.createdAt }];
      for (const t of treatmentsByEvent.get(e.id) ?? []) {
        list.push({ label: `${t.type.replace("_", " ")} applied -- ${e.pestSpecies}`, sub: loc, at: t.appliedAt });
      }
      if (e.resolvedAt) list.push({ label: `${e.pestSpecies} resolved`, sub: loc, at: e.resolvedAt });
      return list;
    })
    .sort((a, b) => b.at.getTime() - a.at.getTime())
    .slice(0, 6);

  // Default facility/area: whichever has the highest-severity open hotspot.
  const hottestEvent = active[0];
  const selectedFacilityId = facilityParam ?? hottestEvent?.facilityId ?? orgFacilities[0].id;
  const selectedFacility = orgFacilities.find((f) => f.id === selectedFacilityId) ?? orgFacilities[0];

  const areas = await db.select().from(facilityAreas).where(eq(facilityAreas.facilityId, selectedFacility.id));
  const facilityEvents = active.filter((e) => e.facilityId === selectedFacility.id);
  const facilityFollowUps = facilityEvents.filter((e) => needsFollowUp(e.createdAt));

  let mapSection: React.ReactNode;
  if (areas.length === 0) {
    mapSection = (
      <div className="card p-6 text-[var(--text-dim)]">
        {selectedFacility.name} has no areas yet.{" "}
        <Link href={`/app/facilities/${selectedFacility.id}`} className="text-[var(--accent)]">
          Add a room or greenhouse
        </Link>{" "}
        to see it on the map.
      </div>
    );
  } else {
    const hottestAreaEvent = [...facilityEvents].sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity])[0];
    const selectedAreaId = areaParam ?? hottestAreaEvent?.facilityAreaId ?? areas[0].id;
    const selectedArea = areas.find((a) => a.id === selectedAreaId) ?? areas[0];

    const objects = await db.select().from(facilityMapObjects).where(eq(facilityMapObjects.facilityAreaId, selectedArea.id));
    const areaPestEvents = await db.select().from(pestEvents).where(and(eq(pestEvents.facilityAreaId, selectedArea.id)));
    const signals = await computeEventSignals(areaPestEvents.map((e) => e.id));

    mapSection = (
      <div className="flex flex-col gap-3">
        {areas.length > 1 && (
          <div className="flex flex-wrap gap-2">
            {areas.map((a) => (
              <Link
                key={a.id}
                href={`/app?facility=${selectedFacility.id}&area=${a.id}`}
                className={`rounded-full px-3 py-1.5 text-sm ${
                  a.id === selectedArea.id ? "bg-[var(--accent)] text-[#0B1626]" : "card text-[var(--text-dim)]"
                }`}
              >
                {a.name}
              </Link>
            ))}
          </div>
        )}

        <div className="card flex items-center justify-between p-3 text-sm">
          <span>{selectedFacility.name}</span>
          <span className="text-[var(--text-dim)]">
            {facilityEvents.length} open hotspot{facilityEvents.length === 1 ? "" : "s"} -- {facilityFollowUps.length}{" "}
            follow-up{facilityFollowUps.length === 1 ? "" : "s"} due
          </span>
        </div>

        <MapEditor
          facilityId={selectedFacility.id}
          area={{
            id: selectedArea.id,
            name: selectedArea.name,
            backgroundImageUrl: selectedArea.backgroundImageUrl,
            backgroundScale: selectedArea.backgroundScale,
          }}
          initialObjects={objects.map((o) => ({
            id: o.id,
            shapeType: o.shapeType,
            geometry: o.geometry as never,
            style: o.style as never,
            label: o.label,
            zIndex: o.zIndex,
          }))}
          initialPestEvents={areaPestEvents.map((ev) => ({
            id: ev.id,
            x: ev.x,
            y: ev.y,
            pestSpecies: ev.pestSpecies,
            severity: ev.severity,
            status: ev.status,
            notes: ev.notes,
            createdAt: ev.createdAt.toISOString(),
            lastTreatedAt: signals.get(ev.id)?.lastTreatedAt ?? null,
            trend: signals.get(ev.id)?.trend ?? null,
          }))}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-center justify-between">
        {orgFacilities.length > 1 ? (
          <div className="flex flex-wrap gap-2">
            {orgFacilities.map((f) => (
              <Link
                key={f.id}
                href={`/app?facility=${f.id}`}
                className={`rounded-full px-3 py-1.5 text-sm ${
                  f.id === selectedFacility.id ? "bg-[var(--accent)] text-[#0B1626]" : "card text-[var(--text-dim)]"
                }`}
              >
                {f.name}
              </Link>
            ))}
          </div>
        ) : (
          <h1 className="text-2xl font-semibold">{selectedFacility.name}</h1>
        )}
        <div className="card flex items-center gap-2 px-3 py-1.5 text-sm">
          <span>{overallStatus.emoji}</span>
          <span>{overallStatus.label}</span>
        </div>
      </div>

      {mapSection}

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-[var(--text-dim)]">Today</h2>
        {todaysTasks.length === 0 ? (
          <div className="card p-4 text-sm text-[var(--text-dim)]">Nothing needs attention right now.</div>
        ) : (
          <div className="flex flex-col gap-4">
            {groupByFacility(todaysTasks).map(([facilityName, rows]) => (
              <div key={facilityName} className="flex flex-col gap-2">
                {orgFacilities.length > 1 && <div className="text-xs text-[var(--text-dim)]">{facilityName}</div>}
                {rows.map((e) => (
                  <Link
                    key={e.id}
                    href={`/app/facilities/${e.facilityId}/pest-events/${e.id}`}
                    className="card card-interactive flex items-center justify-between p-3 text-sm"
                  >
                    <span>
                      Follow-up inspection due -- {e.pestSpecies}
                      {e.areaName && ` (${e.areaName})`}
                    </span>
                    <span className="text-[var(--text-dim)]">→</span>
                  </Link>
                ))}
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-[var(--text-dim)]">Active pest events</h2>
        {active.length === 0 ? (
          <div className="card p-4 text-sm text-[var(--text-dim)]">No active pest events.</div>
        ) : (
          <div className="flex flex-col gap-4">
            {groupByFacility(active).map(([facilityName, rows]) => (
              <div key={facilityName} className="flex flex-col gap-2">
                {orgFacilities.length > 1 && <div className="text-xs text-[var(--text-dim)]">{facilityName}</div>}
                {rows.map((e) => (
                  <Link key={e.id} href={`/app/facilities/${e.facilityId}/pest-events/${e.id}`} className="card card-interactive flex items-center justify-between p-4">
                    <div className="flex items-center gap-3">
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: SEVERITY_COLOR[e.severity] }} />
                      <div>
                        <div className="font-medium capitalize">{e.pestSpecies}</div>
                        <div className="text-sm text-[var(--text-dim)]">
                          {e.areaName ?? "Unassigned area"} -- started {relativeTime(e.createdAt)}
                        </div>
                      </div>
                    </div>
                    <span className="badge capitalize" style={{ background: `${SEVERITY_COLOR[e.severity]}33`, color: SEVERITY_COLOR[e.severity] }}>
                      {e.severity}
                    </span>
                  </Link>
                ))}
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-[var(--text-dim)]">Recent activity</h2>
          <Link href="/app/timeline" className="text-xs text-[var(--accent)]">
            View all →
          </Link>
        </div>
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
