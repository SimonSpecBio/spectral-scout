import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { facilities, facilityAreas, pestEvents, tasks } from "@/db/schema";

export type TaskUrgency = "overdue" | "due_soon" | "scheduled" | "done" | "snoozed";
const DUE_SOON_MS = 24 * 60 * 60 * 1000;

// "overdue" is deliberately not a stored status (see scout_task's schema
// comment) -- derived here from dueAt vs now so it's never stale, same
// spirit as the REI/PHI countdowns being live-computed rather than cached.
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
