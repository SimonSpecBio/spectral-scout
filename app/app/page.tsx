import Link from "next/link";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { facilities, facilityAreas, facilityMapObjects, inventoryItems, pestEvents, tasks, treatments } from "@/db/schema";
import { computeBayLensStats } from "@/lib/map-lenses";
import { computeEventSignals } from "@/lib/pest-event-signals";
import { computeScoutingAlerts, scoutingAlertConfirmHref } from "@/lib/scouting-alerts";
import { taskActionHref, taskUrgency } from "@/lib/tasks";
import { computeEscalationAlerts, computeMonitoringAlerts } from "@/lib/threshold-engine";
import { computeTrapAlerts } from "@/lib/trap-alerts";
import { requireGrowerSession } from "@/lib/session";
import MapEditor from "./facilities/[id]/areas/[areaId]/MapEditorClient";
import MapLensSwitcher, { type BayLensEntry } from "./MapLensSwitcher";
import PressureGraph from "./PressureGraph";

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
// tool" direction. The lens-switching pressure heatmap (MapLensSwitcher --
// dragging precise shapes doesn't work on a phone screen, and the real
// row/bay data model doesn't exist yet, see PressureHeatmapPlaceholder)
// now shows on every screen size, side by side with the real interactive
// Konva map once there's room (lg:) rather than being mobile-only; the
// editable map still needs desktop-grade precision, so it stays desktop-
// only. Everything else (pressure graph, attention required, today's tasks,
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

  // All seven of these only need session.organizationId/user.id, which are
  // already known -- none depends on another's result, so they were pure
  // added latency run one after another. Batched into one round trip
  // instead of seven.
  const [events, myOpenTasks, trapAlertsRaw, scoutingAlerts, orgInventory, monitoringAlertsRaw, orgTreatments, escalationAlerts] = await Promise.all([
    db
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
      .where(eq(facilities.organizationId, session.organizationId!)),
    // "Dashboard Today's Tasks is this same Task list filtered to assignee =
    // me, due = today -- not a separate store" (SCHEDULING.md). Overdue tasks
    // assigned to me surface here too, not just tasks due exactly today,
    // since those are exactly what needs attention first.
    db
      .select()
      .from(tasks)
      .where(and(eq(tasks.organizationId, session.organizationId!), eq(tasks.assigneeUserId, session.user!.id!), eq(tasks.status, "open"))),
    // Trap spikes needing confirmation -- deduped alerts (an open event
    // already tracks this pest+zone) don't get a second, competing card
    // here; they're still visible from the trap's own row on the Traps screen.
    computeTrapAlerts(session.organizationId!),
    // General scouting sessions that crossed threshold with no linked event
    // yet -- same "suggestion, needs a human to confirm" rule as trap alerts
    // (lib/scouting-alerts.ts), just with no species known to dedupe against.
    computeScoutingAlerts(session.organizationId!),
    // "Treatment logged -> decrement InventoryItem; if now below
    // reorderLevel, raise low-stock notification" (ARCHITECTURE.md's
    // trigger rules) -- no separate notification feed exists yet, so this
    // surfaces the same way every other exception does: as an Attention
    // Required card, computed live from quantity vs reorderLevel rather
    // than a stored alert.
    db.select().from(inventoryItems).where(eq(inventoryItems.organizationId, session.organizationId!)),
    // ThresholdEngine (ARCHITECTURE.md ยง3): a real configured infested-%
    // comparison, not the trend heuristic below.
    computeMonitoringAlerts(session.organizationId!),
    db
      .select({ pestEventId: treatments.pestEventId, type: treatments.type, appliedAt: treatments.appliedAt })
      .from(treatments)
      .innerJoin(facilities, eq(treatments.facilityId, facilities.id))
      .where(eq(facilities.organizationId, session.organizationId!)),
    // Treated but not improving -- the mirror of monitoringAlerts, see
    // lib/threshold-engine.ts's comment on computeEscalationAlerts.
    computeEscalationAlerts(session.organizationId!),
  ]);
  const trapAlerts = trapAlertsRaw.filter((a) => !a.dedupedIntoEventId);

  const active = events
    .filter((e) => e.status === "active")
    .sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity]);

  const todaysFollowUps = active.filter((e) => needsFollowUp(e.createdAt));
  const resolvedToday = events.filter((e) => e.status === "resolved" && e.resolvedAt && isToday(e.resolvedAt));
  const myTasksToday = myOpenTasks
    .filter((t) => isToday(t.dueAt) || taskUrgency(t) === "overdue")
    .sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime());

  // Both depend on results from the batch above (active, trapAlerts,
  // scoutingAlerts) but not on each other -- still worth one more
  // Promise.all rather than two sequential awaits.
  const alertAreaIds = [...new Set([...trapAlerts.map((a) => a.facilityAreaId), ...scoutingAlerts.map((a) => a.facilityAreaId)])];
  const [eventSignals, alertAreas] = await Promise.all([
    computeEventSignals(active.map((e) => e.id)),
    alertAreaIds.length ? db.select().from(facilityAreas).where(inArray(facilityAreas.id, alertAreaIds)) : Promise.resolve([]),
  ]);
  const trapAreaNameById = new Map(alertAreas.map((a) => [a.id, a.name]));

  const lowStockItems = orgInventory.filter((i) => i.reorderLevel != null && Number(i.quantity) <= Number(i.reorderLevel));

  // Excludes events the trend heuristic below already surfaced so the same
  // event doesn't show twice.
  const trendingEventIds = new Set(
    active.filter((e) => eventSignals.get(e.id)?.trend === "up" && (e.severity === "high" || e.severity === "severe")).map((e) => e.id)
  );
  const monitoringAlerts = monitoringAlertsRaw.filter((a) => !trendingEventIds.has(a.eventId));

  // Attention Required: real exceptions, not a generic list -- an overdue
  // follow-up, an active event whose density is trending up (computed from
  // real monitoring session history, not a guess), an event over its
  // configured per-pest threshold, a trap over its per-pest threshold
  // awaiting a scout's confirmation, or an inventory item at/below its
  // reorder level.
  const attention = [
    ...todaysFollowUps.map((e) => ({ kind: "followup" as const, event: e })),
    ...active
      .filter((e) => eventSignals.get(e.id)?.trend === "up" && (e.severity === "high" || e.severity === "severe"))
      .map((e) => ({ kind: "trending" as const, event: e })),
    ...monitoringAlerts.map((a) => ({ kind: "threshold" as const, alert: a })),
    ...escalationAlerts.map((a) => ({ kind: "escalation" as const, alert: a })),
    ...trapAlerts.map((a) => ({ kind: "trap" as const, alert: a })),
    ...scoutingAlerts.map((a) => ({ kind: "scouting" as const, alert: a })),
    ...lowStockItems.map((i) => ({ kind: "lowstock" as const, item: i })),
  ].slice(0, 4);

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
  let heatmapEvents: { x: number; y: number; severity: "low" | "moderate" | "high" | "severe" }[] = [];
  let bayLensEntries: BayLensEntry[] = [];
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

    // objects/areaPestEvents/bayLensStats each only need selectedArea.id --
    // one round trip instead of three. signals depends on areaPestEvents'
    // resolved rows, so it stays a separate await after.
    const [objects, areaPestEvents, bayLensStats] = await Promise.all([
      db.select().from(facilityMapObjects).where(eq(facilityMapObjects.facilityAreaId, selectedArea.id)),
      db.select().from(pestEvents).where(and(eq(pestEvents.facilityAreaId, selectedArea.id))),
      computeBayLensStats(selectedArea.id),
    ]);
    const signals = await computeEventSignals(areaPestEvents.map((e) => e.id));

    heatmapEvents = areaPestEvents
      .filter((ev) => ev.status === "active" && ev.x != null && ev.y != null)
      .map((ev) => ({ x: ev.x!, y: ev.y!, severity: ev.severity }));

    bayLensEntries = [...bayLensStats.entries()].map(([key, s]) => ({
      key,
      lastScoutedAt: s.lastScoutedAt ? s.lastScoutedAt.toISOString() : null,
      avgTempF: s.avgTempF,
      avgHumidityPct: s.avgHumidityPct,
    }));

    desktopMapSection = (
      <div className="flex flex-col gap-3">
        {areas.length > 1 && (
          <div className="flex flex-wrap gap-2">
            {areas.map((a) => (
              <Link
                key={a.id}
                href={`/app?facility=${selectedFacility.id}&area=${a.id}`}
                className={`rounded-full px-3 py-1.5 text-sm ${
                  a.id === selectedArea.id ? "bg-[var(--accent)] text-[var(--on-accent)]" : "card text-[var(--text-dim)]"
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

  // Multi-facility roll-up ("2 houses need attention" -- ARCHITECTURE.md's
  // cross-cutting rules): a per-facility alert count on top of the
  // existing switcher rather than a separate screen, since a grower
  // running several sites needs this at the same glance as picking which
  // one to look at, not one navigation away from it.
  const activeCountByFacility = new Map<string, number>();
  for (const e of active) {
    activeCountByFacility.set(e.facilityId, (activeCountByFacility.get(e.facilityId) ?? 0) + 1);
  }
  const facilitiesNeedingAttention = orgFacilities.filter((f) => (activeCountByFacility.get(f.id) ?? 0) > 0).length;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        {orgFacilities.length > 1 ? (
          <div className="flex flex-col gap-2">
            {facilitiesNeedingAttention > 0 && (
              <span className="label-mono" style={{ color: "var(--accent)" }}>
                {facilitiesNeedingAttention} of {orgFacilities.length} sites need attention
              </span>
            )}
            <div className="flex flex-wrap gap-2">
              {orgFacilities.map((f) => {
                const count = activeCountByFacility.get(f.id) ?? 0;
                return (
                  <Link
                    key={f.id}
                    href={`/app?facility=${f.id}`}
                    className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm ${
                      f.id === selectedFacility.id ? "bg-[var(--accent)] text-[var(--on-accent)]" : "card text-[var(--text-dim)]"
                    }`}
                  >
                    {count > 0 && (
                      <span
                        className="h-1.5 w-1.5 rounded-full"
                        style={{ background: f.id === selectedFacility.id ? "var(--on-accent)" : "var(--accent)" }}
                      />
                    )}
                    {f.name}
                  </Link>
                );
              })}
            </div>
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

      <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
        <MapLensSwitcher events={heatmapEvents} bayLensEntries={bayLensEntries} />
        <div className="hidden sm:block">{desktopMapSection}</div>
      </div>

      <PressureGraph events={events.map((e) => ({ createdAt: e.createdAt, resolvedAt: e.resolvedAt, severity: e.severity }))} />

      <section className="flex flex-col gap-3">
        <span className="label-mono">Attention required</span>
        {attention.length === 0 ? (
          <div className="card p-4 text-sm text-[var(--text-dim)]">Nothing needs attention right now.</div>
        ) : (
          <div className="card flex flex-col divide-y divide-[var(--border)]">
            {attention.map((item) => {
              if (item.kind === "trap") {
                const a = item.alert;
                return (
                  <Link
                    key={`trap-${a.trapId}`}
                    href={`/app/new-event?facility=${a.facilityId}&area=${a.facilityAreaId}`}
                    className="flex items-center gap-3 p-3.5"
                  >
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: "var(--accent)" }} />
                    <div className="flex-1">
                      <div className="text-sm">{a.trapLabel} spike &mdash; confirm {a.pestSpecies}?</div>
                      <div className="label-mono">
                        {(trapAreaNameById.get(a.facilityAreaId) ?? "").toUpperCase()} &middot; {a.catchPerDay.toFixed(1)}/DAY
                      </div>
                    </div>
                    <span className="text-[var(--text-faint)]">›</span>
                  </Link>
                );
              }
              if (item.kind === "scouting") {
                const a = item.alert;
                return (
                  <Link
                    key={`scouting-${a.observationId}`}
                    href={scoutingAlertConfirmHref(a)}
                    className="flex items-center gap-3 p-3.5"
                  >
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: "var(--accent)" }} />
                    <div className="flex-1">
                      <div className="text-sm">Scouting log over threshold — confirm?</div>
                      <div className="label-mono">
                        {(trapAreaNameById.get(a.facilityAreaId) ?? "").toUpperCase()} &middot; {a.infestedPct}% INFESTED
                      </div>
                    </div>
                    <span className="text-[var(--text-faint)]">›</span>
                  </Link>
                );
              }
              if (item.kind === "threshold") {
                const a = item.alert;
                return (
                  <Link
                    key={`threshold-${a.eventId}`}
                    href={`/app/facilities/${a.facilityId}/pest-events/${a.eventId}`}
                    className="flex items-center gap-3 p-3.5"
                  >
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: "var(--accent)" }} />
                    <div className="flex-1">
                      <div className="text-sm">{a.pestSpecies} over threshold</div>
                      <div className="label-mono">
                        {a.infestedPct}% INFESTED &middot; THRESHOLD {a.threshold}%
                      </div>
                    </div>
                    <span className="text-[var(--text-faint)]">›</span>
                  </Link>
                );
              }
              if (item.kind === "escalation") {
                const a = item.alert;
                return (
                  <Link
                    key={`escalation-${a.eventId}`}
                    href={`/app/facilities/${a.facilityId}/pest-events/${a.eventId}?tab=recommended`}
                    className="flex items-center gap-3 p-3.5"
                  >
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: "var(--accent)" }} />
                    <div className="flex-1">
                      <div className="text-sm">{a.pestSpecies} not improving — try a different tier?</div>
                      <div className="label-mono">
                        {a.baselinePct}% → {a.latestPct}% AFTER {a.daysSinceTreatment}D
                      </div>
                    </div>
                    <span className="text-[var(--text-faint)]">›</span>
                  </Link>
                );
              }
              if (item.kind === "lowstock") {
                const i = item.item;
                return (
                  <Link key={`lowstock-${i.id}`} href="/app/inventory" className="flex items-center gap-3 p-3.5">
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: "var(--accent)" }} />
                    <div className="flex-1">
                      <div className="text-sm">{i.name} low stock</div>
                      <div className="label-mono">
                        {Number(i.quantity)} {i.unit === "units" ? "" : i.unit} LEFT · REORDER
                      </div>
                    </div>
                    <span className="text-[var(--text-faint)]">›</span>
                  </Link>
                );
              }
              const e = item.event;
              return (
              <Link key={`${item.kind}-${e.id}`} href={`/app/facilities/${e.facilityId}/pest-events/${e.id}`} className="flex items-center gap-3 p-3.5">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: "var(--accent)" }} />
                <div className="flex-1">
                  <div className="text-sm capitalize">{item.kind === "followup" ? `${e.pestSpecies} recheck overdue` : `${e.pestSpecies} trending up`}</div>
                  <div className="label-mono">
                    {(e.areaName ?? e.facilityName).toUpperCase()} &middot; {item.kind === "followup" ? relativeTime(e.createdAt) : e.severity.toUpperCase()}
                  </div>
                </div>
                <span className="text-[var(--text-faint)]">›</span>
              </Link>
              );
            })}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <span className="label-mono">Today&apos;s tasks</span>
          <Link href="/app/schedule" className="text-xs text-[var(--accent)]">
            Schedule →
          </Link>
        </div>
        {myTasksToday.length === 0 && todaysFollowUps.length === 0 && resolvedToday.length === 0 ? (
          <div className="card p-4 text-sm text-[var(--text-dim)]">Nothing on the list today.</div>
        ) : (
          <div className="card flex flex-col gap-3 p-4">
            {myTasksToday.map((t) => (
              <Link key={t.id} href={taskActionHref(t)} className="flex items-center gap-3">
                <span
                  className="h-4 w-4 shrink-0 rounded border"
                  style={{ borderColor: taskUrgency(t) === "overdue" ? "var(--accent)" : "var(--text-faint)" }}
                />
                <span className="text-sm" style={taskUrgency(t) === "overdue" ? { color: "var(--accent)" } : undefined}>
                  {t.title}
                </span>
              </Link>
            ))}
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
          <div className="card p-4">
            {/* Each row is its own flex container with a rail column (dot +
                a line segment that grows to fill the row's own height) --
                self-adjusting to whatever height the text takes, instead of
                the previous fixed negative-margin trick that only lined up
                for single-line entries. */}
            {activity.map((a, i) => (
              <div key={i} className="flex gap-3">
                <div className="flex w-3 shrink-0 flex-col items-center">
                  <span
                    className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full"
                    style={{ background: a.alert ? "var(--accent)" : "var(--border-soft)" }}
                  />
                  {i < activity.length - 1 && <span className="mt-1 w-px flex-1" style={{ background: "var(--border-soft)" }} />}
                </div>
                <div className="pb-3.5">
                  <div className="text-sm" style={{ color: a.alert ? "var(--text)" : "var(--text-dim)" }}>
                    {a.label}
                  </div>
                  <div className="label-mono">
                    {relativeTime(a.at).toUpperCase()} {a.sub && `· ${a.sub.toUpperCase()}`}
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
