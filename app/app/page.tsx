import { eq } from "drizzle-orm";
import { db } from "@/db";
import { facilities, pestEvents } from "@/db/schema";
import { requireGrowerSession } from "@/lib/session";

export default async function Dashboard() {
  const session = await requireGrowerSession();
  if (!session) return null;

  const orgFacilities = await db
    .select()
    .from(facilities)
    .where(eq(facilities.organizationId, session.organizationId!));

  const activeEvents = orgFacilities.length
    ? await db.select().from(pestEvents).where(eq(pestEvents.status, "active"))
    : [];

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Dashboard</h1>

      {orgFacilities.length === 0 ? (
        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-6 text-[var(--text-dim)]">
          No facilities yet. Add your first facility to start scouting.
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
            <div className="text-3xl font-semibold">{orgFacilities.length}</div>
            <div className="text-sm text-[var(--text-dim)]">Facilities</div>
          </div>
          <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
            <div className="text-3xl font-semibold">{activeEvents.length}</div>
            <div className="text-sm text-[var(--text-dim)]">Active pest events</div>
          </div>
        </div>
      )}
    </div>
  );
}
