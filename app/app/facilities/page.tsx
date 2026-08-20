import Link from "next/link";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { facilities } from "@/db/schema";
import { requireGrowerSession } from "@/lib/session";
import NewFacilityForm from "./NewFacilityForm";

export default async function FacilitiesPage() {
  const session = await requireGrowerSession();
  if (!session) return null;

  const rows = await db
    .select()
    .from(facilities)
    .where(eq(facilities.organizationId, session.organizationId!));

  return (
    <div className="mx-auto flex max-w-md flex-col gap-6">
      <h1 className="text-2xl font-semibold">Sites</h1>
      <NewFacilityForm />
      {rows.length === 0 ? (
        <div className="card p-4 text-sm text-[var(--text-dim)]">No sites yet.</div>
      ) : (
        <div className="card flex flex-col divide-y divide-[var(--border)]">
          {rows.map((f) => (
            <Link key={f.id} href={`/app/facilities/${f.id}`} className="px-4 py-3 text-sm hover:bg-[var(--surface-raised)]">
              {f.name}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
