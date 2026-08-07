import Link from "next/link";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { facilities, facilityAreas, inventoryItems } from "@/db/schema";
import { requireGrowerSession } from "@/lib/session";
import NewTreatmentForm from "./NewTreatmentForm";

// "Application log" -- the create sheet's 4th item (ARCHITECTURE.md ยง5b).
// Not scoped to an existing Pest Event: a routine biocontrol release or
// preventive spray with no infestation behind it. Event-scoped treatments
// still go through the pest event's own Treatments tab (PestEventDetail),
// which inherits the event's location automatically.
export default async function NewTreatmentPage({ searchParams }: { searchParams: Promise<{ facility?: string }> }) {
  const session = await requireGrowerSession();
  if (!session) return null;

  const { facility: facilityId } = await searchParams;

  const orgFacilities = await db
    .select()
    .from(facilities)
    .where(eq(facilities.organizationId, session.organizationId!));

  if (orgFacilities.length === 0) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-2xl font-semibold">Application log</h1>
        <div className="card p-6 text-[var(--text-dim)]">
          No sites yet.{" "}
          <Link href="/app/facilities" className="text-[var(--accent)]">
            Add your first site
          </Link>{" "}
          first.
        </div>
      </div>
    );
  }

  if (!facilityId) {
    return (
      <div className="mx-auto flex max-w-md flex-col gap-4">
        <h1 className="text-2xl font-semibold">Application log</h1>
        <div className="text-sm text-[var(--text-dim)]">Which site?</div>
        {orgFacilities.map((f) => (
          <Link key={f.id} href={`/app/new-treatment?facility=${f.id}`} className="card card-interactive p-4">
            {f.name}
          </Link>
        ))}
      </div>
    );
  }

  const items = await db.select().from(inventoryItems).where(eq(inventoryItems.organizationId, session.organizationId!));

  return (
    <div className="mx-auto flex max-w-md flex-col gap-6">
      <h1 className="text-2xl font-semibold">Application log</h1>
      <NewTreatmentForm
        facilityId={facilityId}
        items={items.map((i) => ({ id: i.id, name: i.name, unit: i.unit, quantity: Number(i.quantity) }))}
      />
    </div>
  );
}
