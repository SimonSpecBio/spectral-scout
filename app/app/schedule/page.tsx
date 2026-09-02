import { getOrgTasks, taskActionHref, taskUrgency } from "@/lib/tasks";
import { getTeam } from "@/lib/team";
import { requireGrowerSession } from "@/lib/session";
import ScheduleCalendar from "./ScheduleCalendar";

export const dynamic = "force-dynamic";

// Team agenda (16_schedule.svg) -- now a real month-calendar grid (ticket
// C4) instead of a day-grouped list; tapping a day shows that day's tasks
// in the list's original row style. The [+] here creates a manual task
// (assign flow, screen 17); auto-generated tasks aren't produced yet (see
// lib/inventory-catalog.ts's comment on the deferred recommendation engine).
export default async function SchedulePage() {
  const session = await requireGrowerSession();
  if (!session) return null;

  const rows = await getOrgTasks(session.organizationId!);
  const { members } = await getTeam(session.organizationId!);

  const openRows = rows.filter((r) => r.task.status !== "done");

  return (
    <ScheduleCalendar
      rows={openRows.map((r) => ({
        id: r.task.id,
        title: r.task.title,
        type: r.task.type,
        dueAt: r.task.dueAt.toISOString(),
        assigneeUserId: r.task.assigneeUserId,
        areaName: r.areaName,
        facilityName: r.facilityName,
        pestSpecies: r.pestSpecies,
        urgency: taskUrgency(r.task),
        href: taskActionHref(r.task),
      }))}
      members={members.map((m) => ({ userId: m.userId, name: m.name, email: m.email }))}
      currentUserId={session.user!.id!}
    />
  );
}
