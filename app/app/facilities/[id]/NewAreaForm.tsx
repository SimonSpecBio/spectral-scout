"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { queuedFetch } from "@/lib/offline-queue";

const AREA_KINDS = ["greenhouse", "flowering_room", "propagation_room", "growing_bay", "building", "other"] as const;

export default function NewAreaForm({ facilityId }: { facilityId: string }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [kind, setKind] = useState<(typeof AREA_KINDS)[number]>("greenhouse");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const result = await queuedFetch(`/api/facilities/${facilityId}/areas`, { name, kind }, "New area");
    if (result.ok) {
      setName("");
      router.refresh();
    } else {
      setError("Failed to create area");
    }
    setSubmitting(false);
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-2">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Area name (e.g. Flower Room 2)"
        required
        className="flex-1 rounded-md border border-[var(--border)] bg-transparent px-3 py-2 text-sm"
      />
      <select
        value={kind}
        onChange={(e) => setKind(e.target.value as typeof kind)}
        className="rounded-md border border-[var(--border)] bg-transparent px-3 py-2 text-sm"
      >
        {AREA_KINDS.map((k) => (
          <option key={k} value={k}>
            {k.replace("_", " ")}
          </option>
        ))}
      </select>
      <button
        type="submit"
        disabled={submitting}
        className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-[var(--on-accent)] disabled:opacity-50"
      >
        {submitting ? "Adding…" : "Add area"}
      </button>
      {error && <span className="self-center text-sm text-[var(--danger)]">{error}</span>}
    </form>
  );
}
