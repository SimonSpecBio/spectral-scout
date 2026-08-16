"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { queuedFetch } from "@/lib/offline-queue";
import LocationPicker, { type PickerFacility } from "../LocationPicker";

// No fields precede placement -- a trap has nothing to configure besides
// where it sits (label auto-numbers "Trap N" server-side) -- so this goes
// straight into the swipeable multi-facility picker instead of a
// form-then-map two-step; site + area + bay all get chosen there in one
// screen, same as every other creation flow now.
export default function NewTrapForm({ facilities }: { facilities: PickerFacility[] }) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirmLocation(facilityId: string, areaId: string, x: number, y: number) {
    setSubmitting(true);
    const result = await queuedFetch(`/api/facilities/${facilityId}/areas/${areaId}/traps`, { x, y }, "New trap");
    if (result.ok) {
      router.push(`/app/traps?facility=${facilityId}&area=${areaId}`);
    } else {
      setSubmitting(false);
      setError("Couldn't add trap. Try again.");
    }
  }

  return (
    <>
      {error && <div className="card p-4 text-sm text-[var(--accent)]">{error}</div>}
      <LocationPicker facilities={facilities} onConfirm={handleConfirmLocation} onCancel={() => router.back()} />
      {submitting && <div className="fixed inset-x-0 top-0 z-[60] p-2 text-center text-xs text-[var(--text-dim)]">Adding trap…</div>}
    </>
  );
}
