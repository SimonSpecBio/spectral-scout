import Link from "next/link";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { facilities } from "@/db/schema";
import { computeRestrictions, labelBiologicalReleases } from "@/lib/rei-phi";
import { requireGrowerSession } from "@/lib/session";

export const dynamic = "force-dynamic";

const LOOKBACK_DAYS = 14;

function formatCountdown(ms: number): string {
  if (ms <= 0) return "Clear";
  const hours = Math.floor(ms / 3_600_000);
  if (hours >= 24) return `${Math.ceil(hours / 24)}d`;
  const mins = Math.floor((ms % 3_600_000) / 60_000);
  return `${hours}h ${mins}m`;
}

export default async function ReiPhiPage({ searchParams }: { searchParams: Promise<{ facility?: string }> }) {
  const session = await requireGrowerSession();
  if (!session) return null;

  const { facility: facilityParam } = await searchParams;
  const orgFacilities = await db.select().from(facilities).where(eq(facilities.organizationId, session.organizationId!));

  if (orgFacilities.length === 0) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-2xl font-semibold">Re-entry &amp; harvest</h1>
        <div className="card p-6 text-[var(--text-dim)]">
          No sites yet.{" "}
          <Link href="/app/facilities" className="text-[var(--accent)]">
            Add your first site
          </Link>
          .
        </div>
      </div>
    );
  }

  const selectedFacility = orgFacilities.find((f) => f.id === facilityParam) ?? orgFacilities[0];
  const restrictions = await computeRestrictions(selectedFacility.id);
  const active = restrictions.filter((r) => r.reiActive || r.phiActive);

  const bioTreatments = await labelBiologicalReleases(selectedFacility.id, LOOKBACK_DAYS);
  const clearRestricted = restrictions.filter((r) => !r.reiActive && !r.phiActive);

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-6">
      <h1 className="text-2xl font-semibold">Re-entry &amp; harvest</h1>

      {orgFacilities.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {orgFacilities.map((f) => (
            <Link
              key={f.id}
              href={`/app/rei-phi?facility=${f.id}`}
              className={`rounded-full px-3 py-1.5 text-sm ${f.id === selectedFacility.id ? "bg-[var(--accent)] text-[var(--on-accent)]" : "card text-[var(--text-dim)]"}`}
            >
              {f.name}
            </Link>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-2">
        <div className="label-mono">Active restrictions</div>
        {active.length === 0 ? (
          <div className="card p-4 text-sm text-[var(--text-dim)]">Nothing restricted right now.</div>
        ) : (
          active.map((r) => (
            <div key={r.treatmentId} className="flex flex-col gap-3">
              {r.reiActive && r.reiEndsAt && (
                <div className="card flex items-center justify-between gap-3 p-4" style={{ background: "var(--danger-bg)", borderColor: "var(--danger-border)" }}>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: "var(--danger)" }} />
                      <span className="truncate">{r.bay} — no entry</span>
                    </div>
                    <div className="truncate text-xs text-[var(--text-dim)]">
                      {r.product} applied {r.appliedAt.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })} · REI {r.reiHours}h
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="text-lg font-medium" style={{ color: "var(--danger)" }}>
                      {formatCountdown(r.reiEndsAt.getTime() - Date.now())}
                    </div>
                    <div className="label-mono">re-entry at</div>
                  </div>
                </div>
              )}
              {r.phiActive && r.phiEndsAt && (
                <div className="card flex items-center justify-between gap-3 p-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: "var(--warning)" }} />
                      <span className="truncate">{r.bay} — no harvest</span>
                    </div>
                    <div className="truncate text-xs text-[var(--text-dim)]">
                      {r.product} · PHI {r.phiDays}d
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="text-lg font-medium" style={{ color: "var(--warning)" }}>
                      {formatCountdown(r.phiEndsAt.getTime() - Date.now())}
                    </div>
                    <div className="label-mono">harvest from</div>
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      <div className="flex flex-col gap-2">
        <div className="label-mono">Clear</div>
        <div className="card flex flex-col divide-y divide-[var(--border)]">
          {bioTreatments.length === 0 && clearRestricted.length === 0 ? (
            <div className="p-4 text-sm text-[var(--text-dim)]">Nothing to show.</div>
          ) : (
            <>
              {bioTreatments.map((t) => (
                <div key={t.id} className="flex items-center gap-3 p-3.5">
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: "var(--success)" }} />
                  <div>
                    <div className="text-sm">{t.bay} · {t.product ?? "biocontrol"} released</div>
                    <div className="label-mono">Biocontrol · no restriction</div>
                  </div>
                </div>
              ))}
              {clearRestricted.map((r) => (
                <div key={r.treatmentId} className="flex items-center gap-3 p-3.5">
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: "var(--success)" }} />
                  <div>
                    <div className="text-sm">
                      {r.bay} · {r.product}
                    </div>
                    <div className="label-mono">Cleared</div>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      </div>

      <Link
        href={`/app/new-treatment?facility=${selectedFacility.id}`}
        className="rounded-md bg-[var(--accent)] px-4 py-3 text-center text-sm font-medium text-[var(--on-accent)]"
      >
        Log a treatment
      </Link>
    </div>
  );
}
