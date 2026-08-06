"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import LocationPlacement from "../LocationPlacement";

// No fields precede placement -- a trap has nothing to configure besides
// where it sits (label auto-numbers "Trap N" server-side), so this goes
// straight to LocationPlacement instead of a form-then-map two-step.
export default function NewTrapForm({ facilityId, areaId }: { facilityId: string; areaId: string }) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirmLocation(x: number, y: number) {
    setSubmitting(true);
    const res = await fetch(`/api/facilities/${facilityId}/areas/${areaId}/traps`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ x, y }),
    });
    if (res.ok) {
      router.push(`/app/traps?facility=${facilityId}&area=${areaId}`);
    } else {
      setSubmitting(false);
      setError("Couldn't add trap. Try again.");
    }
  }

  return (
    <>
      {error && <div className="card p-4 text-sm text-[var(--accent)]">{error}</div>}
      <LocationPlacement onConfirm={handleConfirmLocation} onCancel={() => router.back()} />
      {submitting && <div className="fixed inset-x-0 top-0 z-[60] p-2 text-center text-xs text-[var(--text-dim)]">Adding trap…</div>}
    </>
  );
}
