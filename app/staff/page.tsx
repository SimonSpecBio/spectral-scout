import { db } from "@/db";
import { organizations } from "@/db/schema";
import { canStaffViewOrgDetail, requireStaffSession } from "@/lib/session";

// Deliberately renders every org's row, but only pilot-tier orgs get a
// name/link -- general-tier orgs show as an anonymized count, not because
// the UI is hiding a link, but because canStaffViewOrgDetail() is the same
// gate the API routes enforce. If this page's data source ever changes to
// fetch org detail per-row (e.g. a facility count), that fetch itself needs
// to skip general-tier orgs, not just the display.
export default async function StaffOrgs() {
  const session = await requireStaffSession();
  if (!session) return null;

  const orgs = await db.select().from(organizations);
  const pilotOrgs = orgs.filter((o) => canStaffViewOrgDetail(o.accountTier));
  const generalCount = orgs.length - pilotOrgs.length;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Organizations</h1>

      <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
        <div className="text-3xl font-semibold">{generalCount}</div>
        <div className="text-sm text-[var(--text-dim)]">
          Free-tier organizations (aggregated only -- no per-org drill-down)
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <h2 className="text-lg font-medium">Pilot program organizations</h2>
        {pilotOrgs.length === 0 && <div className="text-[var(--text-dim)]">None yet.</div>}
        {pilotOrgs.map((org) => (
          <div key={org.id} className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
            {org.name} {org.pilotKey && <span className="text-[var(--text-dim)]">({org.pilotKey})</span>}
          </div>
        ))}
      </div>
    </div>
  );
}
