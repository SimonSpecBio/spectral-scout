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
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Facilities</h1>
      <NewFacilityForm />
      <div className="flex flex-col gap-2">
        {rows.length === 0 && <div className="text-[var(--text-dim)]">No facilities yet.</div>}
        {rows.map((f) => (
          <Link key={f.id} href={`/app/facilities/${f.id}`} className="card card-interactive p-4">
            {f.name}
          </Link>
        ))}
      </div>
    </div>
  );
}
