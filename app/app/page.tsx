import Link from "next/link";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { facilities, facilityAreas, inventoryItems, pestEvents, tasks, treatments } from "@/db/schema";
import { SEVERITY_COLOR, type Severity } from "@/lib/colors";
import { isHomeGrower } from "@/lib/grower-type";
import { computeBayLensStats } from "@/lib/map-lenses";
import { computeEventSignals } from "@/lib/pest-event-signals";
import { computeScoutingAlerts, scoutingAlertConfirmHref } from "@/lib/scouting-alerts";
import { taskActionHref, taskUrgency } from "@/lib/tasks";
import { computeEscalationAlerts, computeMonitoringAlerts, metricLabel, type MetricKind } from "@/lib/threshold-engine";
import { computeTrapAlerts } from "@/lib/trap-alerts";
import { displayNameForPestSpecies, displayNameForTreatmentType } from "@/lib/treatments-catalog";
import { requireGrowerSession } from "@/lib/session";
import HomeSwipeNav from "./HomeSwipeNav";
import MapLensSwitcher, { type BayLensEntry } from "./MapLensSwitcher";
import OutbreaksStat from "./OutbreaksStat";
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

// Trap/scouting alerts have no linked event yet (that's the whole point --
// they're a suggestion to create one), so there's no real severity to read.
// Bands them from how far over threshold they are instead, using the same
// cutoffs NewEventForm's severityFromHandoff already applies to infested %
// when promoting a scouting handoff into an event, so a scout sees the same
// number read the same way in both places.
function bandFromInfestedPct(pct: number): Severity {
  if (pct >= 60) return "severe";
  if (pct >= 40) return "high";
  if (pct >= 20) return "moderate";
  return "low";
}
// Density's counterpart to bandFromInfestedPct -- same bands
// NewEventForm's severityFromHandoff uses for a Counts-method handoff, so
// a scout sees the same reading banded the same way everywhere.
function bandFromDensity(perLeaf: number): Severity {
  if (perLeaf >= 9) return "severe";
  if (perLeaf >= 6) return "high";
  if (perLeaf >= 3) return "moderate";
  return "low";
}
function bandFromMetric(kind: MetricKind, value: number): Severity {
  return kind === "density" ? bandFromDensity(value) : bandFromInfestedPct(value);
}
function bandFromRatio(ratio: number): Severity {
  if (ratio >= 3) return "severe";
  if (ratio >= 2) return "high";
  if (ratio >= 1.5) return "moderate";
  return "low";
}

// The whole app in one screen, per the "mission control, not a drawing
// tool" direction. The lens-switching pressure heatmap (MapLensSwitcher --
// dragging precise shapes doesn't work on a phone screen, so it recolors a
// generic 20-bay grid from real event data instead of the facility's exact
// floor plan, see PressureBayMap) now shows on every screen size, side by
// side with the real interactive Konva map once there's room (lg:) rather
// than being mobile-only; the editable map still needs desktop-grade
// precision, so it stays desktop-only. Everything else (pressure graph,
// attention required, today's tasks, recent activity) is real data on both.
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

  // Default facility/area: whichever has the highest-severity open hotspot.
  const hottestEvent = active[0];
  const selectedFacilityId = facilityParam ?? hottestEvent?.facilityId ?? orgFacilities[0].id;
  const selectedFacility = orgFacilities.find((f) => f.id === selectedFacilityId) ?? orgFacilities[0];

  // Everything below (pest-pressure chart, Attention Required, Today's
  // Tasks, Recent Activity) scopes to selectedFacility -- these all used to
  // show the same org-wide data no matter which site pill was selected
  // (ticket found in QA, 2026-09-03). Inventory has no per-facility concept
  // in the schema, so low-stock alerts stay org-wide by design. A task with
  // no facilityId (a general, unlinked task) still shows regardless of
  // which site is selected, rather than becoming permanently invisible.
  const facilityEvents = events.filter((e) => e.facilityId === selectedFacility.id);
  const facilityActive = active.filter((e) => e.facilityId === selectedFacility.id);
  const facilityTrapAlerts = trapAlerts.filter((a) => a.facilityId === selectedFacility.id);
  const facilityScoutingAlerts = scoutingAlerts.filter((a) => a.facilityId === selectedFacility.id);
  const facilityEscalationAlerts = escalationAlerts.filter((a) => a.facilityId === selectedFacility.id);

  // Week-over-week rather than "vs last grow cycle" -- there's no cycle-
  // start-date concept in the schema to compute that honestly, and the
  // ticket's own alternative framing (week-over-week) needs nothing new.
  // A real sense of momentum, especially for home growers who might not
  // otherwise notice it, without inventing a number the app can't back up.
  const WEEK_MS = 7 * DAY_MS;
  const outbreaksThisWeekEvents = facilityEvents.filter((e) => Date.now() - e.createdAt.getTime() < WEEK_MS);
  const outbreaksThisWeek = outbreaksThisWeekEvents.length;
  const outbreaksLastWeek = facilityEvents.filter((e) => {
    const age = Date.now() - e.createdAt.getTime();
    return age >= WEEK_MS && age < 2 * WEEK_MS;
  }).length;

  const eventSeverityById = new Map(active.map((e) => [e.id, e.severity]));
  const todaysFollowUps = facilityActive.filter((e) => needsFollowUp(e.createdAt));
  const resolvedToday = facilityEvents.filter((e) => e.status === "resolved" && e.resolvedAt && isToday(e.resolvedAt));
  const myTasksToday = myOpenTasks.filter(
    (t) => (t.facilityId === selectedFacility.id || t.facilityId == null) && (isToday(t.dueAt) || taskUrgency(t) === "overdue")
  );

  // "Today's tasks" used to render three separate sub-lists back to back
  // (assigned tasks, overdue follow-ups, resolved-today) with only the
  // first actually sorted -- a scout had to read the whole card to find
  // what was most urgent instead of it just being first. One list, open
  // items ranked by how overdue/due-soon they are (earlier timestamp =
  // more urgent), done items always last (already handled, lowest
  // priority regardless of when) and sorted by most-recently-resolved.
  const todaysTaskRows = [
    ...myTasksToday.map((t) => ({ key: `task-${t.id}`, urgencyAt: t.dueAt.getTime(), kind: "task" as const, task: t })),
    ...todaysFollowUps.map((e) => ({ key: `followup-${e.id}`, urgencyAt: e.createdAt.getTime(), kind: "followup" as const, event: e })),
  ].sort((a, b) => a.urgencyAt - b.urgencyAt);
  const resolvedTodayRows = resolvedToday
    .slice()
    .sort((a, b) => (b.resolvedAt?.getTime() ?? 0) - (a.resolvedAt?.getTime() ?? 0));

  // Both depend on results from the batch above (active, trapAlerts,
  // scoutingAlerts) but not on each other -- still worth one more
  // Promise.all rather than two sequential awaits.
  const alertAreaIds = [
    ...new Set([...facilityTrapAlerts.map((a) => a.facilityAreaId), ...facilityScoutingAlerts.map((a) => a.facilityAreaId)]),
  ];
  const [eventSignals, alertAreas] = await Promise.all([
    computeEventSignals(active.map((e) => e.id)),
    alertAreaIds.length ? db.select().from(facilityAreas).where(inArray(facilityAreas.id, alertAreaIds)) : Promise.resolve([]),
  ]);
  const trapAreaNameById = new Map(alertAreas.map((a) => [a.id, a.name]));

  const lowStockItems = orgInventory.filter((i) => i.reorderLevel != null && Number(i.quantity) <= Number(i.reorderLevel));

  // Excludes events the trend heuristic below already surfaced so the same
  // event doesn't show twice.
  const trendingActive = facilityActive.filter(
    (e) => eventSignals.get(e.id)?.trend === "up" && (e.severity === "high" || e.severity === "severe")
  );
  const trendingEventIds = new Set(trendingActive.map((e) => e.id));
  const monitoringAlerts = monitoringAlertsRaw.filter((a) => !trendingEventIds.has(a.eventId) && a.facilityId === selectedFacility.id);

  // Attention Required: real exceptions, not a generic list -- an overdue
  // follow-up, an active event whose density is trending up (computed from
  // real monitoring session history, not a guess), an event over its
  // configured per-pest threshold, a trap over its per-pest threshold
  // awaiting a scout's confirmation, or an inventory item at/below its
  // reorder level.
  const attention = [
    ...todaysFollowUps.map((e) => ({ kind: "followup" as const, event: e })),
    ...trendingActive.map((e) => ({ kind: "trending" as const, event: e })),
    ...monitoringAlerts.map((a) => ({ kind: "threshold" as const, alert: a })),
    ...facilityEscalationAlerts.map((a) => ({ kind: "escalation" as const, alert: a })),
    ...facilityTrapAlerts.map((a) => ({ kind: "trap" as const, alert: a })),
    ...facilityScoutingAlerts.map((a) => ({ kind: "scouting" as const, alert: a })),
    ...lowStockItems.map((i) => ({ kind: "lowstock" as const, item: i })),
  ];

  const treatmentsByEvent = new Map<string, typeof orgTreatments>();
  for (const t of orgTreatments) {
    if (!t.pestEventId) continue;
    treatmentsByEvent.set(t.pestEventId, [...(treatmentsByEvent.get(t.pestEventId) ?? []), t]);
  }
  const locationOf = (e: (typeof events)[number]) => e.areaName ?? e.facilityName;
  const activity = facilityEvents
    .flatMap((e) => {
      const loc = locationOf(e);
      const species = displayNameForPestSpecies(e.pestSpecies);
      const href = `/app/facilities/${e.facilityId}/pest-events/${e.id}`;
      const list = [{ label: `${species} detected`, sub: loc, at: e.createdAt, alert: true, href }];
      for (const t of treatmentsByEvent.get(e.id) ?? []) {
        list.push({ label: `${displayNameForTreatmentType(t.type)} applied: ${species}`, sub: loc, at: t.appliedAt, alert: false, href });
      }
      if (e.resolvedAt) list.push({ label: `${species} resolved`, sub: loc, at: e.resolvedAt, alert: false, href });
      return list;
    })
    .sort((a, b) => b.at.getTime() - a.at.getTime())
    .slice(0, 6);

  const areas = await db.select().from(facilityAreas).where(eq(facilityAreas.facilityId, selectedFacility.id));

  let areaSwitcher: React.ReactNode = null;
  let currentAreaId: string | null = null;
  let heatmapEvents: {
    id: string;
    facilityId: string;
    x: number;
    y: number;
    severity: "low" | "moderate" | "high" | "severe";
    pestSpecies: string;
  }[] = [];
  let bayLensEntries: BayLensEntry[] = [];
  if (areas.length > 0) {
    const hottestAreaEvent = [...facilityActive].sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity])[0];
    const selectedAreaId = areaParam ?? hottestAreaEvent?.facilityAreaId ?? areas[0].id;
    const selectedArea = areas.find((a) => a.id === selectedAreaId) ?? areas[0];
    currentAreaId = selectedArea.id;

    const [areaPestEvents, bayLensStats] = await Promise.all([
      db.select().from(pestEvents).where(and(eq(pestEvents.facilityAreaId, selectedArea.id))),
      computeBayLensStats(selectedArea.id),
    ]);

    heatmapEvents = areaPestEvents
      .filter((ev) => ev.status === "active" && ev.x != null && ev.y != null)
      .map((ev) => ({
        id: ev.id,
        facilityId: selectedFacility.id,
        x: ev.x!,
        y: ev.y!,
        severity: ev.severity,
        pestSpecies: ev.pestSpecies,
      }));

    bayLensEntries = [...bayLensStats.entries()].map(([key, s]) => ({
      key,
      lastScoutedAt: s.lastScoutedAt ? s.lastScoutedAt.toISOString() : null,
      avgTempF: s.avgTempF,
      avgHumidityPct: s.avgHumidityPct,
    }));

    if (areas.length > 1) {
      areaSwitcher = (
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
      );
    }
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

  // "Scout / member: first screen is a due list, not a map" -- a scout's
  // job on any given visit is working down what's due, not staring at
  // pressure trends only a manager acts on. Owner/manager keeps the
  // existing map-first home entirely unchanged; the sections below are
  // the exact same JSX either way, just reordered (and the map swapped
  // for a link) per role rather than duplicated.
  const isScout = session.membershipRole === "member";

  const headerRow = (
    <div className="flex items-center justify-between gap-3">
      {orgFacilities.length > 1 ? (
          <div className="flex min-w-0 flex-col gap-2">
            {facilitiesNeedingAttention > 0 && (
              <span className="label-mono whitespace-nowrap" style={{ color: "var(--accent)" }}>
                {facilitiesNeedingAttention === orgFacilities.length
                  ? "All sites need attention"
                  : `${facilitiesNeedingAttention} of ${orgFacilities.length} sites need attention`}
              </span>
            )}
            <div className="hide-scrollbar flex snap-x gap-2 overflow-x-auto pr-4">
              {orgFacilities.map((f) => {
                const count = activeCountByFacility.get(f.id) ?? 0;
                return (
                  <Link
                    key={f.id}
                    href={`/app?facility=${f.id}`}
                    className={`flex shrink-0 snap-start items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-sm ${
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
      </div>
  );

  const mapAndGraphSection = (
    <>
      {areaSwitcher}
      <MapLensSwitcher
        facilityId={selectedFacility.id}
        areas={areas.map((a) => ({ id: a.id, name: a.name }))}
        currentAreaId={currentAreaId}
        events={heatmapEvents}
        bayLensEntries={bayLensEntries}
      />

      <PressureGraph events={facilityEvents.map((e) => ({ createdAt: e.createdAt, resolvedAt: e.resolvedAt, severity: e.severity }))} />

      {facilityEvents.length === 0 ? (
        <Link href="/app/preventive" className="card flex items-center justify-between gap-3 p-4 text-sm">
          <span>New here? See a preventive starter checklist before your first pest shows up.</span>
          <span className="shrink-0 text-[var(--accent)]">View →</span>
        </Link>
      ) : (
        (outbreaksThisWeek > 0 || outbreaksLastWeek > 0) && (
          <OutbreaksStat
            outbreaksThisWeek={outbreaksThisWeek}
            outbreaksLastWeek={outbreaksLastWeek}
            thisWeekEvents={outbreaksThisWeekEvents.map((e) => ({
              id: e.id,
              facilityId: e.facilityId,
              pestSpecies: e.pestSpecies,
              facilityName: e.facilityName,
              areaName: e.areaName,
            }))}
          />
        )
      )}
    </>
  );

  // Scout home skips the full map/graph -- a lightweight count-of-hotspots
  // link instead, per "3 hotspots in this room, tap to see them" rather
  // than embedding the 7-day pressure chart nobody but a manager acts on.
  const scoutMapLink = (
    <Link href={`/app/facilities/${selectedFacility.id}`} className="card flex items-center justify-between gap-3 p-4 text-sm">
      <span>
        {facilityActive.length} active hotspot
        {facilityActive.length === 1 ? "" : "s"} at {selectedFacility.name}
      </span>
      <span className="shrink-0 text-[var(--accent)]">View map →</span>
    </Link>
  );

  const attentionSection = (
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
                    <span
                      className="h-1.5 w-1.5 shrink-0 rounded-full"
                      style={{ background: SEVERITY_COLOR[bandFromRatio(a.catchPerDay / a.threshold)] }}
                    />
                    <div className="flex-1">
                      <div className="text-sm">{a.trapLabel} spike. Confirm {displayNameForPestSpecies(a.pestSpecies)}?</div>
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
                    <span
                      className="h-1.5 w-1.5 shrink-0 rounded-full"
                      style={{ background: SEVERITY_COLOR[bandFromMetric(a.metricKind, a.value)] }}
                    />
                    <div className="flex-1">
                      <div className="text-sm">Scouting log over threshold. Confirm?</div>
                      <div className="label-mono">
                        {(trapAreaNameById.get(a.facilityAreaId) ?? "").toUpperCase()} &middot;{" "}
                        {metricLabel({ kind: a.metricKind, value: a.value }).toUpperCase()}
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
                    <span
                      className="h-1.5 w-1.5 shrink-0 rounded-full"
                      style={{ background: SEVERITY_COLOR[eventSeverityById.get(a.eventId) ?? bandFromMetric(a.metricKind, a.value)] }}
                    />
                    <div className="flex-1">
                      <div className="text-sm">{displayNameForPestSpecies(a.pestSpecies)} over threshold</div>
                      <div className="label-mono">
                        {metricLabel({ kind: a.metricKind, value: a.value }).toUpperCase()} &middot; THRESHOLD{" "}
                        {a.metricKind === "occupancy" ? `${a.threshold}%` : `${a.threshold}/LEAF`}
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
                    <span
                      className="h-1.5 w-1.5 shrink-0 rounded-full"
                      style={{ background: SEVERITY_COLOR[eventSeverityById.get(a.eventId) ?? bandFromMetric(a.metricKind, a.latestValue)] }}
                    />
                    <div className="flex-1">
                      <div className="text-sm">{displayNameForPestSpecies(a.pestSpecies)} not improving. Try a different tier?</div>
                      <div className="label-mono">
                        {metricLabel({ kind: a.metricKind, value: a.baselineValue }).toUpperCase()} →{" "}
                        {metricLabel({ kind: a.metricKind, value: a.latestValue }).toUpperCase()} AFTER {a.daysSinceTreatment}D
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
                    <span
                      className="h-1.5 w-1.5 shrink-0 rounded-full"
                      style={{ background: SEVERITY_COLOR[Number(i.quantity) <= 0 ? "severe" : "moderate"] }}
                    />
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
                <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: SEVERITY_COLOR[e.severity] }} />
                <div className="flex-1">
                  <div className="text-sm capitalize">{item.kind === "followup" ? `${displayNameForPestSpecies(e.pestSpecies)} recheck overdue` : `${displayNameForPestSpecies(e.pestSpecies)} trending up`}</div>
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
  );

  const tasksSection = (
    <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <span className="label-mono">Today&apos;s tasks</span>
          <Link href="/app/schedule" className="text-xs text-[var(--accent)]">
            Schedule →
          </Link>
        </div>
        {todaysTaskRows.length === 0 && resolvedTodayRows.length === 0 ? (
          <div className="card p-4 text-sm text-[var(--text-dim)]">Nothing on the list today.</div>
        ) : (
          <div className="card flex flex-col gap-3 p-4">
            {todaysTaskRows.map((row) =>
              row.kind === "task" ? (
                <Link key={row.key} href={taskActionHref(row.task)} className="flex items-center gap-3">
                  <span
                    className="h-4 w-4 shrink-0 rounded border"
                    style={{ borderColor: taskUrgency(row.task) === "overdue" ? "var(--accent)" : "var(--text-faint)" }}
                  />
                  <span className="text-sm" style={taskUrgency(row.task) === "overdue" ? { color: "var(--accent)" } : undefined}>
                    {row.task.title}
                  </span>
                </Link>
              ) : (
                <Link key={row.key} href={`/app/facilities/${row.event.facilityId}/pest-events/${row.event.id}`} className="flex items-center gap-3">
                  <span className="h-4 w-4 shrink-0 rounded border border-[var(--text-faint)]" />
                  <span className="text-sm">
                    Follow up {displayNameForPestSpecies(row.event.pestSpecies)} -- {row.event.areaName ?? row.event.facilityName}
                  </span>
                </Link>
              )
            )}
            {resolvedTodayRows.map((e) => (
              <div key={e.id} className="flex items-center gap-3">
                <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded bg-[var(--surface-raised)] text-[length:var(--text-2xs)] text-[var(--text-faint)]">
                  ✓
                </span>
                <span className="text-sm text-[var(--text-faint)] line-through">{displayNameForPestSpecies(e.pestSpecies)} resolved</span>
              </div>
            ))}
          </div>
        )}
    </section>
  );

  const activitySection = (
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
                <Link href={a.href} className="pb-3.5">
                  <div className="text-sm" style={{ color: a.alert ? "var(--text)" : "var(--text-dim)" }}>
                    {a.label}
                  </div>
                  <div className="label-mono">
                    {relativeTime(a.at).toUpperCase()} {a.sub && `· ${a.sub.toUpperCase()}`}
                  </div>
                </Link>
              </div>
            ))}
          </div>
        )}
    </section>
  );

  return (
    <HomeSwipeNav facilities={orgFacilities.map((f) => ({ id: f.id }))} currentFacilityId={selectedFacility.id}>
      <div className="flex flex-col gap-6">
        {headerRow}
        {isHomeGrower(session.growerType) && (
          <Link href="/app/symptom-check" className="card flex items-center justify-between p-4 text-sm">
            <span>
              <span className="font-medium">Should I worry?</span>
              <span className="block text-xs text-[var(--text-dim)]">Answer a few quick questions about what you&rsquo;re seeing</span>
            </span>
            <span className="text-[var(--accent)]">&rarr;</span>
          </Link>
        )}
        {isScout ? (
          <>
            {tasksSection}
            {attentionSection}
            {scoutMapLink}
          </>
        ) : (
          <>
            {mapAndGraphSection}
            {attentionSection}
            {tasksSection}
          </>
        )}
        {activitySection}
      </div>
    </HomeSwipeNav>
  );
}
