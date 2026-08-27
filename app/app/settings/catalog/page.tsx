import { asc, eq } from "drizzle-orm";
import Link from "next/link";
import { db } from "@/db";
import { customSpecies, monitoringThresholds, trapThresholds } from "@/db/schema";
import { requireGrowerSession } from "@/lib/session";
import { DEFAULT_DENSITY_THRESHOLD, DEFAULT_INFESTED_PCT_THRESHOLD } from "@/lib/threshold-engine";
import { DEFAULT_CATCH_PER_DAY_THRESHOLD } from "@/lib/trap-alerts";
import CatalogClient from "./CatalogClient";

export const dynamic = "force-dynamic";

// Org-editable extensions to the built-in catalogs: custom species names
// (feed SpeciesPicker's autocomplete everywhere) and per-species
// monitoring thresholds (already read live by threshold-engine.ts --
// see db/schema.ts's monitoringThresholds comment -- this page is the
// first UI that writes to that table).
export default async function CatalogSettingsPage() {
  const session = await requireGrowerSession();
  if (!session) return null;

  const [species, thresholds, trapThresholdRows] = await Promise.all([
    db
      .select()
      .from(customSpecies)
      .where(eq(customSpecies.organizationId, session.organizationId!))
      .orderBy(asc(customSpecies.commonName)),
    db
      .select()
      .from(monitoringThresholds)
      .where(eq(monitoringThresholds.organizationId, session.organizationId!))
      .orderBy(asc(monitoringThresholds.pestSpecies)),
    db
      .select()
      .from(trapThresholds)
      .where(eq(trapThresholds.organizationId, session.organizationId!))
      .orderBy(asc(trapThresholds.pestSpecies)),
  ]);

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-6">
      <Link href="/app/settings" className="text-sm text-[var(--text-dim)]">
        &lsaquo; Settings
      </Link>
      <h1 className="text-2xl font-semibold">Species &amp; thresholds</h1>
      <CatalogClient
        isOwner={session.membershipRole === "owner"}
        initialSpecies={species.map((s) => ({ ...s, createdAt: s.createdAt.toISOString() }))}
        initialThresholds={thresholds.map((t) => ({ ...t, createdAt: t.createdAt.toISOString() }))}
        initialTrapThresholds={trapThresholdRows.map((t) => ({ ...t, createdAt: t.createdAt.toISOString() }))}
        defaultPctThreshold={DEFAULT_INFESTED_PCT_THRESHOLD}
        defaultDensityThreshold={DEFAULT_DENSITY_THRESHOLD}
        defaultCatchPerDayThreshold={DEFAULT_CATCH_PER_DAY_THRESHOLD}
      />
    </div>
  );
}
