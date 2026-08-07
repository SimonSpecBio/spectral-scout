import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { facilities, pestEvents } from "@/db/schema";
import { getTaskLoadByUser } from "@/lib/tasks";
import { getTeam } from "@/lib/team";
import { requireGrowerSession } from "@/lib/session";
import NewTaskForm from "./NewTaskForm";

export default async function NewTaskPage() {
  const session = await requireGrowerSession();
  if (!session) return null;

  const [orgFacilities, { members }] = await Promise.all([
    db.select().from(facilities).where(eq(facilities.organizationId, session.organizationId!)),
    getTeam(session.organizationId!),
  ]);
  const facilityIds = orgFacilities.map((f) => f.id);
  const [activeEvents, load] = await Promise.all([
    facilityIds.length
      ? db.select().from(pestEvents).where(inArray(pestEvents.facilityId, facilityIds))
      : Promise.resolve([]),
    getTaskLoadByUser(
      session.organizationId!,
      members.map((m) => m.userId)
    ),
  ]);

  return (
    <div className="mx-auto flex max-w-md flex-col gap-6">
      <h1 className="text-2xl font-semibold">Assign task</h1>
      <NewTaskForm
        facilities={orgFacilities.map((f) => ({ id: f.id, name: f.name }))}
        members={members.map((m) => ({ userId: m.userId, name: m.name, email: m.email, load: load.get(m.userId) ?? 0 }))}
        events={activeEvents
          .filter((e) => e.status === "active")
          .map((e) => ({ id: e.id, pestSpecies: e.pestSpecies, facilityId: e.facilityId }))}
      />
    </div>
  );
}
