import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { facilities, facilityAreas, pestEvents, tasks } from "@/db/schema";
import { getTeam } from "@/lib/team";
import type { MetricKind } from "@/lib/threshold-engine";

export type TaskUrgency = "overdue" | "due_soon" | "scheduled" | "done" | "snoozed";
const DUE_SOON_MS = 24 * 60 * 60 * 1000;

// "overdue" is deliberately not a stored status (see scout_task's schema
// comment) -- derived here from dueAt vs now so it's never stale, same
// spirit as the REI/PHI countdowns being live-computed rather than cached.
// A monitor-type task backed by a real pest event has one obvious next
// action -- log the recheck -- so tapping it should land directly on the
// plant-sampling grid (10 plants x top/mid/bottom leaf) instead of a task
// detail page that just links onward to a Method Choice screen the answer
// to which is already known. Other task types (release, treatment,
// trap_read, ...) have no dedicated capture screen yet, so those still
// land on task detail. Shared by the dashboard's Today's tasks, the
// Schedule list, and Notifications so all three behave the same way.
export function taskActionHref(task: { id: string; type: string; facilityId: string | null; pestEventId: string | null }): string {
  if (task.type === "monitor" && task.facilityId && task.pestEventId) {
    return `/app/facilities/${task.facilityId}/pest-events/${task.pestEventId}/monitoring?taskId=${task.id}&method=plant_sampling`;
  }
  return `/app/schedule/${task.id}`;
}

export function taskUrgency(task: { status: "open" | "done" | "snoozed"; dueAt: Date }): TaskUrgency {
  if (task.status !== "open") return task.status;
  const now = Date.now();
  if (task.dueAt.getTime() < now) return "overdue";
  if (task.dueAt.getTime() - now < DUE_SOON_MS) return "due_soon";
  return "scheduled";
}

export async function getOrgTasks(organizationId: string) {
  const rows = await db
    .select({
      task: tasks,
      facilityName: facilities.name,
      areaName: facilityAreas.name,
      pestSpecies: pestEvents.pestSpecies,
      pestEventStatus: pestEvents.status,
    })
    .from(tasks)
    .leftJoin(facilities, eq(tasks.facilityId, facilities.id))
    .leftJoin(facilityAreas, eq(tasks.facilityAreaId, facilityAreas.id))
    .leftJoin(pestEvents, eq(tasks.pestEventId, pestEvents.id))
    .where(eq(tasks.organizationId, organizationId));
  return rows;
}

export async function getTask(organizationId: string, taskId: string) {
  const [row] = await db
    .select({
      task: tasks,
      facilityName: facilities.name,
      areaName: facilityAreas.name,
      pestSpecies: pestEvents.pestSpecies,
      pestEventStatus: pestEvents.status,
    })
    .from(tasks)
    .leftJoin(facilities, eq(tasks.facilityId, facilities.id))
    .leftJoin(facilityAreas, eq(tasks.facilityAreaId, facilityAreas.id))
    .leftJoin(pestEvents, eq(tasks.pestEventId, pestEvents.id))
    .where(and(eq(tasks.id, taskId), eq(tasks.organizationId, organizationId)));
  return row ?? null;
}

// Open task count per assignee -- "the team with current load counts so
// work can be balanced" (SCHEDULING.md's assignee picker, screen 17).
export async function getTaskLoadByUser(organizationId: string, userIds: string[]): Promise<Map<string, number>> {
  const load = new Map<string, number>();
  if (userIds.length === 0) return load;
  const openTasks = await db
    .select({ assigneeUserId: tasks.assigneeUserId })
    .from(tasks)
    .where(and(eq(tasks.organizationId, organizationId), eq(tasks.status, "open"), inArray(tasks.assigneeUserId, userIds)));
  for (const t of openTasks) {
    if (!t.assigneeUserId) continue;
    load.set(t.assigneeUserId, (load.get(t.assigneeUserId) ?? 0) + 1);
  }
  return load;
}

// Auto-assigns an auto-generated task (recheck/release from the
// recommendation engine, apply-program/route.ts) to a real person instead
// of leaving it unassigned. An unassigned task has nothing pointing anyone
// at it -- both of notifications.ts's task_assigned/task_overdue kinds are
// keyed off assigneeUserId -- so it was effectively invisible until a
// manager happened to check the Schedule "everyone" tab. Picks the member
// (role="member", i.e. a worker/scout, not the owner/manager who applied
// the treatment) with the fewest currently-open tasks, the same load
// figure the manual assign picker already shows. Falls back to null
// (unassigned, today's behavior) if the org has no workers yet -- a solo
// owner shouldn't get auto-assigned their own follow-ups.
export async function assignLeastLoadedWorker(organizationId: string): Promise<string | null> {
  const { members } = await getTeam(organizationId);
  const workers = members.filter((m) => m.role === "member");
  if (workers.length === 0) return null;

  const load = await getTaskLoadByUser(
    organizationId,
    workers.map((w) => w.userId)
  );
  let best = workers[0].userId;
  let bestLoad = load.get(best) ?? 0;
  for (const w of workers.slice(1)) {
    const l = load.get(w.userId) ?? 0;
    if (l < bestLoad) {
      best = w.userId;
      bestLoad = l;
    }
  }
  return best;
}

const DAY_MS = 86_400_000;
const KEEP_AN_EYE_RECHECK_DAYS = 7;

// A reading that's nonzero but still under threshold ("5 pests is
// essentially nothing, just keep an eye on it") shouldn't vanish with no
// trace the moment the session is logged -- it should still put a
// low-urgency recheck on the schedule so the area actually gets looked at
// again, same spirit as the Severe-hotspot auto-recheck in
// pest-events/route.ts but for the sub-threshold case that alerting
// deliberately stays quiet about. Only fires on a real, positive reading
// (a clean 0-count session needs no follow-up) and only when no open
// auto-created recheck already exists for this exact area -- a grower
// scouting the same bay every few days shouldn't accumulate a stack of
// "keep an eye on" tasks for the same ongoing situation.
export async function maybeScheduleKeepAnEyeRecheck(params: {
  organizationId: string;
  facilityId: string;
  facilityAreaId: string;
  pestEventId: string | null;
  pestSpecies: string | null;
  locationLabel: string;
  metricKind: MetricKind;
  value: number;
  threshold: number;
  x: number | null;
  y: number | null;
}): Promise<void> {
  const { organizationId, facilityId, facilityAreaId, pestEventId, pestSpecies, locationLabel, value, threshold, x, y } = params;
  if (value <= 0 || value >= threshold) return;

  const existing = await db
    .select({ id: tasks.id })
    .from(tasks)
    .where(
      and(
        eq(tasks.organizationId, organizationId),
        eq(tasks.facilityAreaId, facilityAreaId),
        eq(tasks.status, "open"),
        eq(tasks.source, "auto_trigger"),
        eq(tasks.type, "monitor")
      )
    )
    .limit(1);
  if (existing.length > 0) return;

  const assigneeUserId = await assignLeastLoadedWorker(organizationId);
  await db.insert(tasks).values({
    organizationId,
    title: pestSpecies ? `Keep an eye on ${pestSpecies} — ${locationLabel}` : `Keep an eye on ${locationLabel}`,
    type: "monitor",
    facilityId,
    facilityAreaId,
    pestEventId,
    x,
    y,
    assigneeUserId,
    source: "auto_trigger",
    dueAt: new Date(Date.now() + KEEP_AN_EYE_RECHECK_DAYS * DAY_MS),
  });
}
