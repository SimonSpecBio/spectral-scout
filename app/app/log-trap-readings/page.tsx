import Link from "next/link";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { facilities, facilityAreas, traps } from "@/db/schema";
import { bayLabel, nearestBay } from "@/lib/floorplan-bays";
import { requireGrowerSession } from "@/lib/session";
import LogTrapReadingsForm from "./LogTrapReadingsForm";

// Reached from the "+" menu, under Scouting log -- walks every trap in one
// area in a single pass for one target pest, matching how a grower actually
// checks a trap network rather than one trap at a time.
export default async function LogTrapReadingsPage({
  searchParams,
}: {
  searchParams: Promise<{ facility?: string; area?: string }>;
}) {
  const session = await requireGrowerSession();
  if (!session) return null;

  const { facility: facilityId, area: areaId } = await searchParams;

  const orgFacilities = await db
    .select()
    .from(facilities)
    .where(eq(facilities.organizationId, session.organizationId!));

  if (orgFacilities.length === 0) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-2xl font-semibold">Log trap readings</h1>
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
      <div className="mx-auto flex w-full max-w-md flex-col gap-4">
        <h1 className="text-2xl font-semibold">Log trap readings</h1>
        <div className="text-sm text-[var(--text-dim)]">Which site?</div>
        {orgFacilities.map((f) => (
          <Link key={f.id} href={`/app/log-trap-readings?facility=${f.id}`} className="card card-interactive p-4">
            {f.name}
          </Link>
        ))}
      </div>
    );
  }

  const areas = await db.select().from(facilityAreas).where(eq(facilityAreas.facilityId, facilityId));

  if (!areaId) {
    if (areas.length === 0) {
      return (
        <div className="mx-auto flex w-full max-w-md flex-col gap-4">
          <h1 className="text-2xl font-semibold">Log trap readings</h1>
          <div className="card p-6 text-sm text-[var(--text-dim)]">
            This site has no areas yet.{" "}
            <Link href={`/app/facilities/${facilityId}`} className="text-[var(--accent)]">
              Add a room or greenhouse
            </Link>{" "}
            first.
          </div>
        </div>
      );
    }
    return (
      <div className="mx-auto flex w-full max-w-md flex-col gap-4">
        <h1 className="text-2xl font-semibold">Log trap readings</h1>
        <div className="text-sm text-[var(--text-dim)]">Which area?</div>
        {areas.map((a) => (
          <Link key={a.id} href={`/app/log-trap-readings?facility=${facilityId}&area=${a.id}`} className="card card-interactive p-4">
            {a.name}
          </Link>
        ))}
      </div>
    );
  }

  const areaTraps = await db
    .select()
    .from(traps)
    .where(and(eq(traps.facilityId, facilityId), eq(traps.facilityAreaId, areaId)))
    .orderBy(traps.createdAt);

  if (areaTraps.length === 0) {
    return (
      <div className="mx-auto flex w-full max-w-md flex-col gap-4">
        <h1 className="text-2xl font-semibold">Log trap readings</h1>
        <div className="card p-6 text-sm text-[var(--text-dim)]">
          This area has no traps yet.{" "}
          <Link href={`/app/new-trap?facility=${facilityId}&area=${areaId}`} className="text-[var(--accent)]">
            Add a trap
          </Link>{" "}
          first.
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-6">
      <h1 className="text-2xl font-semibold">Log trap readings</h1>
      <LogTrapReadingsForm
        facilityId={facilityId}
        areaId={areaId}
        traps={areaTraps.map((t) => ({ id: t.id, label: t.label, bay: bayLabel(nearestBay(t.x, t.y)) }))}
      />
    </div>
  );
}
