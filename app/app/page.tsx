import Link from "next/link";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { facilities, facilityAreas, facilityMapObjects, pestEvents, treatments } from "@/db/schema";
import { computeEventSignals } from "@/lib/pest-event-signals";
import { requireGrowerSession } from "@/lib/session";
import MapEditor from "./facilities/[id]/areas/[areaId]/MapEditorClient";
import PressureGraph from "./PressureGraph";
import PressureHeatmapPlaceholder from "./PressureHeatmapPlaceholder";

// Next.js's Router Cache can reuse a cached render for this route on a
// search-params-only navigation (e.g. clicking a different site pill),
// which is exactly the "every site shows the same map" bug this fixes --
// force-dynamic guarantees a real server render (and a real DB query) on
// every visit, no stale reuse across facility=/area= values.
export const dynamic = "force-dynamic";

const SEVERITY_RANK = { low: 0, moderate: 1, high: 2, severe: 3 } as const;
const FOLLOW_UP_AFTER_DAYS = 3;
const DAY_MS = 86_400_000;

function needsFollowUp(createdAt: Date): boolean {
  return Date.now() - createdAt.getTime() > FOLLOW_UP_AFTER_DAYS * DAY_MS;
}
function isToday(date: Date): boolean {
  const now = new Date();
  return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate();
}
function relativeTime(date: Date): string {
  const days = Math.floor((Date.now() - date.getTime()) / DAY_MS);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  return `${days} days ago`;
}

// The whole app in one screen, per the "mission control, not a drawing
// tool" direction. Mobile shows a placeholder pressure heatmap where the
// real interactive map would go (dragging precise shapes doesn't work on a
// phone screen, and the real row/bay data model doesn't exist yet -- see
// PressureHeatmapPlaceholder); desktop keeps the real interactive Konva map.
// Everything else (pressure graph, attention required, today's tasks,
// recent activity) is real data on both.
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

  const todaysFollowUps = active.filter((e) => needsFollowUp(e.createdAt));
  const resolvedToday = events.filter((e) => e.status === "resolved" && e.resolvedAt && isToday(e.resolvedAt));

  const eventSignals = await computeEventSignals(active.map((e) => e.id));
  // Attention Required: real exceptions, not a generic list -- an overdue
  // follow-up, or an active event whose density is trending up (computed
  // from real monitoring session history, not a guess).
  const attention = [
    ...todaysFollowUps.map((e) => ({ kind: "followup" as const, event: e })),
    ...active
      .filter((e) => eventSignals.get(e.id)?.trend === "up" && (e.severity === "high" || e.severity === "severe"))
      .map((e) => ({ kind: "trending" as const, event: e })),
  ].slice(0, 4);

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
      const list = [{ label: `${e.pestSpecies} detected`, sub: loc, at: e.createdAt, alert: true }];
      for (const t of treatmentsByEvent.get(e.id) ?? []) {
        list.push({ label: `${t.type.replace("_", " ")} applied -- ${e.pestSpecies}`, sub: loc, at: t.appliedAt, alert: false });
      }
      if (e.resolvedAt) list.push({ label: `${e.pestSpecies} resolved`, sub: loc, at: e.resolvedAt, alert: false });
      return list;
    })
    .sort((a, b) => b.at.getTime() - a.at.getTime())
    .slice(0, 6);

  // Default facility/area: whichever has the highest-severity open hotspot.
  const hottestEvent = active[0];
  const selectedFacilityId = facilityParam ?? hottestEvent?.facilityId ?? orgFacilities[0].id;
  const selectedFacility = orgFacilities.find((f) => f.id === selectedFacilityId) ?? orgFacilities[0];
  const facilityEvents = active.filter((e) => e.facilityId === selectedFacility.id);

  const areas = await db.select().from(facilityAreas).where(eq(facilityAreas.facilityId, selectedFacility.id));

  let desktopMapSection: React.ReactNode = null;
  if (areas.length === 0) {
    desktopMapSection = (
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

    desktopMapSection = (
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
    <div className="flex flex-col gap-6">
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
          <span className="font-medium">{selectedFacility.name}</span>
        )}
        {facilityEvents.length > 0 && (
          <span className="flex items-center gap-1.5 rounded-full px-2.5 py-1" style={{ background: "#231411" }}>
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--accent)" }} />
            <span className="label-mono" style={{ color: "var(--accent)" }}>
              {facilityEvents.length} ALERT{facilityEvents.length === 1 ? "" : "S"}
            </span>
          </span>
        )}
      </div>

      <div className="sm:hidden">
        <PressureHeatmapPlaceholder />
      </div>
      <div className="hidden sm:block">{desktopMapSection}</div>

      <PressureGraph events={events.map((e) => ({ createdAt: e.createdAt, resolvedAt: e.resolvedAt, severity: e.severity }))} />

      <section className="flex flex-col gap-3">
        <span className="label-mono">Attention required</span>
        {attention.length === 0 ? (
          <div className="card p-4 text-sm text-[var(--text-dim)]">Nothing needs attention right now.</div>
        ) : (
          <div className="card flex flex-col divide-y divide-[var(--border)]">
            {attention.map(({ kind, event: e }) => (
              <Link key={`${kind}-${e.id}`} href={`/app/facilities/${e.facilityId}/pest-events/${e.id}`} className="flex items-center gap-3 p-3.5">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: "var(--accent)" }} />
                <div className="flex-1">
                  <div className="text-sm capitalize">{kind === "followup" ? `${e.pestSpecies} recheck overdue` : `${e.pestSpecies} trending up`}</div>
                  <div className="label-mono">
                    {(e.areaName ?? e.facilityName).toUpperCase()} &middot; {kind === "followup" ? relativeTime(e.createdAt) : e.severity.toUpperCase()}
                  </div>
                </div>
                <span className="text-[var(--text-faint)]">›</span>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <span className="label-mono">Today&apos;s tasks</span>
        {todaysFollowUps.length === 0 && resolvedToday.length === 0 ? (
          <div className="card p-4 text-sm text-[var(--text-dim)]">Nothing on the list today.</div>
        ) : (
          <div className="card flex flex-col gap-3 p-4">
            {todaysFollowUps.map((e) => (
              <Link key={e.id} href={`/app/facilities/${e.facilityId}/pest-events/${e.id}`} className="flex items-center gap-3">
                <span className="h-4 w-4 shrink-0 rounded border border-[var(--text-faint)]" />
                <span className="text-sm">
                  Follow up {e.pestSpecies} -- {e.areaName ?? e.facilityName}
                </span>
              </Link>
            ))}
            {resolvedToday.map((e) => (
              <div key={e.id} className="flex items-center gap-3">
                <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded bg-[var(--surface-raised)] text-[10px] text-[var(--text-faint)]">
                  ✓
                </span>
                <span className="text-sm text-[var(--text-faint)] line-through">{e.pestSpecies} resolved</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <span className="label-mono">Recent activity</span>
          <Link href="/app/timeline" className="text-xs text-[var(--accent)]">
            View all →
          </Link>
        </div>
        {activity.length === 0 ? (
          <div className="text-sm text-[var(--text-dim)]">Nothing yet.</div>
        ) : (
          <div className="card relative p-4 pl-6">
            <div className="absolute bottom-4 left-[11px] top-4 w-px" style={{ background: "var(--border-soft)" }} />
            {activity.map((a, i) => (
              <div key={i} className="relative flex items-start justify-between pb-3.5 last:pb-0">
                <div className="flex items-start gap-3">
                  <span
                    className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full"
                    style={{ background: a.alert ? "var(--accent)" : "var(--border-soft)", marginLeft: "-19px" }}
                  />
                  <div>
                    <div className="text-sm" style={{ color: a.alert ? "var(--text)" : "var(--text-dim)" }}>
                      {a.label}
                    </div>
                    <div className="label-mono">
                      {relativeTime(a.at).toUpperCase()} {a.sub && `· ${a.sub.toUpperCase()}`}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
