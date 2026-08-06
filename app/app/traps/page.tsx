import Link from "next/link";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { facilities, facilityAreas } from "@/db/schema";
import { computeTrapAlerts, computeTrapStatuses } from "@/lib/trap-alerts";
import { sparkPoints } from "@/lib/density";
import { requireGrowerSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function TrapsPage({
  searchParams,
}: {
  searchParams: Promise<{ facility?: string; area?: string }>;
}) {
  const session = await requireGrowerSession();
  if (!session) return null;

  const { facility: facilityParam, area: areaParam } = await searchParams;

  const orgFacilities = await db
    .select()
    .from(facilities)
    .where(eq(facilities.organizationId, session.organizationId!));

  if (orgFacilities.length === 0) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-2xl font-semibold">Sticky traps</h1>
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

  const selectedFacility = orgFacilities.find((f) => f.id === facilityParam) ?? orgFacilities[0];
  const areas = await db.select().from(facilityAreas).where(eq(facilityAreas.facilityId, selectedFacility.id));
  const selectedArea = areaParam ? areas.find((a) => a.id === areaParam) : null;

  const allStatuses = await computeTrapStatuses(selectedFacility.id);
  const statuses = selectedArea ? allStatuses.filter((s) => s.trap.facilityAreaId === selectedArea.id) : allStatuses;
  const alerts = await computeTrapAlerts(session.organizationId!);
  const alertByTrapId = new Map(alerts.map((a) => [a.trapId, a]));

  const trapCount = statuses.length;
  const meanPerDay = trapCount
    ? statuses.reduce((sum, s) => sum + (s.latestReadings[0]?.catchPerDay ?? 0), 0) / trapCount
    : 0;
  const overCount = statuses.filter((s) => s.overThreshold).length;

  return (
    <div className="mx-auto flex max-w-md flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Sticky traps</h1>
        <Link
          href={`/app/new-trap?facility=${selectedFacility.id}${selectedArea ? `&area=${selectedArea.id}` : ""}`}
          className="text-sm text-[var(--accent)]"
        >
          + Add trap
        </Link>
      </div>

      {orgFacilities.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {orgFacilities.map((f) => (
            <Link
              key={f.id}
              href={`/app/traps?facility=${f.id}`}
              className={`rounded-full px-3 py-1.5 text-sm ${
                f.id === selectedFacility.id ? "bg-[var(--accent)] text-[#0B1626]" : "card text-[var(--text-dim)]"
              }`}
            >
              {f.name}
            </Link>
          ))}
        </div>
      )}
      {areas.length > 1 && (
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/app/traps?facility=${selectedFacility.id}`}
            className={`rounded-full px-3 py-1.5 text-sm ${!selectedArea ? "bg-[var(--accent)] text-[#0B1626]" : "card text-[var(--text-dim)]"}`}
          >
            All areas
          </Link>
          {areas.map((a) => (
            <Link
              key={a.id}
              href={`/app/traps?facility=${selectedFacility.id}&area=${a.id}`}
              className={`rounded-full px-3 py-1.5 text-sm ${
                a.id === selectedArea?.id ? "bg-[var(--accent)] text-[#0B1626]" : "card text-[var(--text-dim)]"
              }`}
            >
              {a.name}
            </Link>
          ))}
        </div>
      )}

      <div className="card flex items-center justify-around p-4">
        <div className="text-center">
          <div className="text-lg font-medium">{trapCount}</div>
          <div className="label-mono">Traps</div>
        </div>
        <div className="text-center">
          <div className="text-lg font-medium">{meanPerDay.toFixed(1)}</div>
          <div className="label-mono">Mean/day</div>
        </div>
        <div className="text-center">
          <div className="text-lg font-medium" style={{ color: overCount > 0 ? "var(--accent)" : undefined }}>
            {overCount}
          </div>
          <div className="label-mono">Over</div>
        </div>
      </div>

      {statuses.length === 0 ? (
        <div className="card p-6 text-sm text-[var(--text-dim)]">
          No traps yet.{" "}
          <Link
            href={`/app/new-trap?facility=${selectedFacility.id}${selectedArea ? `&area=${selectedArea.id}` : ""}`}
            className="text-[var(--accent)]"
          >
            Add your first trap
          </Link>
          .
        </div>
      ) : (
        <div className="card flex flex-col divide-y divide-[var(--border)]">
          {statuses.map((s) => {
            const latest = s.latestReadings[0];
            const alert = alertByTrapId.get(s.trap.id);
            return (
              <div key={s.trap.id} className="flex flex-col" style={s.overThreshold ? { background: "#150E0C" } : undefined}>
                <div className="flex items-center gap-3 p-3.5">
                  {s.overThreshold && <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: "var(--accent)" }} />}
                  <div className="flex-1">
                    <div className="text-sm">{s.trap.label}</div>
                    <div className="label-mono">{s.bayLabel.toUpperCase()}</div>
                  </div>
                  {s.history.length > 1 && (
                    <svg width="60" height="24" viewBox="0 0 60 24" className="shrink-0">
                      <polyline
                        points={sparkPoints(s.history, 60, 24, 3)}
                        fill="none"
                        stroke={s.overThreshold ? "var(--accent)" : "#4E6280"}
                        strokeWidth="1.5"
                      />
                    </svg>
                  )}
                  <div className="text-right">
                    <div className="text-sm" style={{ color: s.overThreshold ? "var(--accent)" : undefined }}>
                      {latest ? latest.catchPerDay.toFixed(1) : "—"}
                    </div>
                    <div className="label-mono">/DAY</div>
                  </div>
                </div>
                {alert && (
                  <Link
                    href={
                      alert.dedupedIntoEventId
                        ? `/app/facilities/${selectedFacility.id}/pest-events/${alert.dedupedIntoEventId}`
                        : `/app/new-event?facility=${selectedFacility.id}&area=${s.trap.facilityAreaId}`
                    }
                    className="mx-3.5 mb-3.5 flex items-center justify-between rounded-lg px-3 py-2 text-xs"
                    style={{ background: "#231411" }}
                  >
                    <span className="text-[var(--text)]">
                      {alert.dedupedIntoEventId ? "Event already tracking this" : `Confirm ${alert.pestSpecies} event?`}
                    </span>
                    <span style={{ color: "var(--accent)" }}>›</span>
                  </Link>
                )}
              </div>
            );
          })}
        </div>
      )}

      <Link
        href={`/app/log-trap-readings?facility=${selectedFacility.id}${selectedArea ? `&area=${selectedArea.id}` : ""}`}
        className="rounded-md bg-[var(--accent)] px-4 py-3 text-center text-sm font-medium text-[#0B1626]"
      >
        Log readings
      </Link>
    </div>
  );
}
