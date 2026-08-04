"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Severity = "low" | "moderate" | "high" | "severe";
const SEVERITIES: Severity[] = ["low", "moderate", "high", "severe"];

// No x/y here -- this event isn't pinned to a spot on the map yet (that
// needs the canvas, which this quick-create deliberately skips for speed).
// It shows up on the Map screen unpositioned; drop a pin for it there later
// if you want it placed.
export default function NewEventForm({ facilityId, areaId }: { facilityId: string; areaId: string }) {
  const router = useRouter();
  const [species, setSpecies] = useState("");
  const [severity, setSeverity] = useState<Severity>("moderate");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    const res = await fetch(`/api/facilities/${facilityId}/pest-events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ facilityAreaId: areaId, pestSpecies: species, severity, notes }),
    });
    if (res.ok) {
      const row = await res.json();
      router.push(`/app/facilities/${facilityId}/pest-events/${row.id}`);
    } else {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="card flex flex-col gap-3 p-4">
      <input
        autoFocus
        value={species}
        onChange={(e) => setSpecies(e.target.value)}
        placeholder="Pest species (e.g. spider mites)"
        required
        className="rounded-md border border-[var(--border)] bg-transparent px-3 py-2 text-sm"
      />
      <div className="flex gap-2">
        {SEVERITIES.map((s) => (
          <button
            type="button"
            key={s}
            onClick={() => setSeverity(s)}
            className={`flex-1 rounded-md border px-3 py-2 text-sm capitalize ${
              severity === s ? "border-[var(--accent)] text-[var(--accent)]" : "border-[var(--border)] text-[var(--text-dim)]"
            }`}
          >
            {s}
          </button>
        ))}
      </div>
      <input
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Notes (optional)"
        className="rounded-md border border-[var(--border)] bg-transparent px-3 py-2 text-sm"
      />
      <button
        type="submit"
        disabled={submitting || !species.trim()}
        className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-[#0B1626] disabled:opacity-50"
      >
        {submitting ? "Creating…" : "Create pest event"}
      </button>
    </form>
  );
}
