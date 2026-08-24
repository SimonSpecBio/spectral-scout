import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { establishmentChecks } from "@/db/schema";
import { getTask } from "@/lib/tasks";
import { requireGrowerSession } from "@/lib/session";
import EstablishmentCheckForm from "./EstablishmentCheckForm";

export const dynamic = "force-dynamic";

export default async function EstablishmentCheckPage({ params }: { params: Promise<{ taskId: string }> }) {
  const session = await requireGrowerSession();
  if (!session) return null;

  const { taskId } = await params;
  const row = await getTask(session.organizationId!, taskId);
  if (!row || row.task.type !== "establishment_check") notFound();

  const [check] = await db.select().from(establishmentChecks).where(eq(establishmentChecks.taskId, taskId));
  if (!check) notFound();

  const daysSinceApplied = Math.max(0, Math.round((Date.now() - row.task.createdAt.getTime()) / 86_400_000));

  return (
    <div className="mx-auto flex max-w-md flex-col gap-6">
      <h1 className="text-2xl font-semibold">Establishment check</h1>
      <EstablishmentCheckForm
        taskId={taskId}
        agentName={check.agentName}
        locationLabel={row.areaName ?? row.facilityName ?? "your facility"}
        daysSinceApplied={daysSinceApplied}
        alreadyChecked={check.established != null ? { established: check.established, notes: check.notes } : null}
      />
    </div>
  );
}
