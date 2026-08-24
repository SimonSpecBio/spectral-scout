import { desc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { users as authUsers } from "@/db/auth-schema";
import { escalations, facilities, observationPhotos, organizations, pestEvents } from "@/db/schema";
import { canStaffViewOrgDetail, requireStaffSession } from "@/lib/session";
import ResolveForm from "./ResolveForm";

export const dynamic = "force-dynamic";

// "Ask a person" queue (ticket 96). Pilot-tier ONLY, enforced twice: once
// at creation (app/api/facilities/.../escalate rejects general-tier
// requests outright, so no row should ever exist for one), and again here
// via canStaffViewOrgDetail() before rendering anything -- same
// defense-in-depth spirit as app/staff/page.tsx's own comment ("that fetch
// itself needs to skip general-tier orgs, not just the display"). If a
// general-tier row is ever somehow found, it's dropped rather than shown,
// not merely hidden behind styling.
export default async function StaffEscalationsPage() {
  const session = await requireStaffSession();
  if (!session) return null;

  const openRows = await db
    .select({
      escalation: escalations,
      event: pestEvents,
      facility: facilities,
      org: organizations,
      requester: authUsers,
    })
    .from(escalations)
    .innerJoin(pestEvents, eq(escalations.pestEventId, pestEvents.id))
    .innerJoin(facilities, eq(pestEvents.facilityId, facilities.id))
    .innerJoin(organizations, eq(escalations.organizationId, organizations.id))
    .leftJoin(authUsers, eq(escalations.requestedByUserId, authUsers.id))
    .where(isNull(escalations.resolvedAt))
    .orderBy(desc(escalations.createdAt));

  const eligible = openRows.filter((r) => canStaffViewOrgDetail(r.org.accountTier));

  const photosByEvent = new Map<string, { id: string; blobUrl: string; caption: string | null }[]>();
  for (const r of eligible) {
    const rows = await db.select().from(observationPhotos).where(eq(observationPhotos.pestEventId, r.event.id));
    photosByEvent.set(r.event.id, rows);
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Ask a person</h1>
      <p className="text-sm text-[var(--text-dim)]">
        Pilot-account escalations only -- free-tier requests never surface an identifiable event here (lib/consent.ts).
      </p>

      {eligible.length === 0 && <div className="card p-4 text-[var(--text-dim)]">No open requests.</div>}

      {eligible.map((r) => (
        <div key={r.escalation.id} className="card flex flex-col gap-3 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-sm font-medium">
                {r.org.name} &middot; {r.facility.name}
              </div>
              <div className="text-xs text-[var(--text-dim)]">
                {r.event.pestSpecies} &middot; {r.event.severity} severity &middot; requested by {r.requester?.name ?? r.requester?.email ?? "someone"}{" "}
                {r.escalation.createdAt.toLocaleString()}
              </div>
            </div>
          </div>
          {r.escalation.note && <div className="text-sm">&ldquo;{r.escalation.note}&rdquo;</div>}
          {(photosByEvent.get(r.event.id) ?? []).length > 0 && (
            <div className="grid grid-cols-4 gap-2">
              {(photosByEvent.get(r.event.id) ?? []).map((p) => (
                <img key={p.id} src={p.blobUrl} alt={p.caption ?? r.event.pestSpecies} className="aspect-square rounded-md object-cover" />
              ))}
            </div>
          )}
          <ResolveForm escalationId={r.escalation.id} />
        </div>
      ))}
    </div>
  );
}
