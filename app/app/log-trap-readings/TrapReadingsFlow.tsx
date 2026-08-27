"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { bayLabel, nearestBay } from "@/lib/floorplan-bays";
import LocationPicker, { type PickerFacility } from "../LocationPicker";
import LogTrapReadingsForm from "./LogTrapReadingsForm";

type Trap = { id: string; label: string; bay: string };

// Site + area picked on one swipeable screen, same "form first, then place
// location" pattern every other capture flow uses -- replaces the old
// facility-list -> area-list server-rendered pages. No pin to place here
// (traps already have their own fixed locations), so LocationPicker runs in
// its pinRequired=false mode: confirming an area is enough to move on.
export default function TrapReadingsFlow({
  facilities,
  presetFacilityId,
  presetAreaId,
}: {
  facilities: PickerFacility[];
  presetFacilityId?: string;
  presetAreaId?: string;
}) {
  const router = useRouter();
  const [target, setTarget] = useState<{ facilityId: string; areaId: string } | null>(null);
  const [traps, setTraps] = useState<Trap[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm(facilityId: string, areaId: string) {
    setTarget({ facilityId, areaId });
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/facilities/${facilityId}/areas/${areaId}/traps`);
      if (!res.ok) throw new Error();
      const rows = (await res.json()) as { id: string; label: string; x: number; y: number }[];
      setTraps(rows.map((t) => ({ id: t.id, label: t.label, bay: bayLabel(nearestBay(t.x, t.y)) })));
    } catch {
      setError("Couldn't load traps for this area. Check your connection and try again.");
    }
    setLoading(false);
  }

  if (!target) {
    return (
      <LocationPicker
        facilities={facilities}
        onConfirm={handleConfirm}
        onCancel={() => router.back()}
        pinRequired={false}
        initialFacilityId={presetFacilityId}
        initialAreaId={presetAreaId}
      />
    );
  }

  if (loading) {
    return <div className="mx-auto flex w-full max-w-md flex-col gap-4 text-sm text-[var(--text-dim)]">Loading traps…</div>;
  }

  if (error) {
    return (
      <div className="mx-auto flex w-full max-w-md flex-col gap-4">
        <div className="card p-6 text-sm text-[var(--danger)]">{error}</div>
        <button onClick={() => setTarget(null)} className="text-sm text-[var(--text-dim)]">
          ← Back
        </button>
      </div>
    );
  }

  if (!traps || traps.length === 0) {
    return (
      <div className="mx-auto flex w-full max-w-md flex-col gap-4">
        <h1 className="text-2xl font-semibold">Log trap readings</h1>
        <div className="card p-6 text-sm text-[var(--text-dim)]">
          This area has no traps yet.{" "}
          <Link href={`/app/new-trap?facility=${target.facilityId}&area=${target.areaId}`} className="text-[var(--accent)]">
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
      <LogTrapReadingsForm facilityId={target.facilityId} areaId={target.areaId} traps={traps} />
    </div>
  );
}
