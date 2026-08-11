"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { markEngaged } from "@/lib/pwa-engagement";
import LocationPicker, { type PickerFacility } from "../LocationPicker";
import SpeciesPicker from "../SpeciesPicker";

type Severity = "low" | "moderate" | "high" | "severe";
const SEVERITIES: Severity[] = ["low", "moderate", "high", "severe"];

export default function NewEventForm({ facilities }: { facilities: PickerFacility[] }) {
  const router = useRouter();
  const [species, setSpecies] = useState("");
  const [scientificName, setScientificName] = useState<string | null>(null);
  const [severity, setSeverity] = useState<Severity>("moderate");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [placingLocation, setPlacingLocation] = useState(false);

  async function handleConfirmLocation(facilityId: string, areaId: string, x: number, y: number) {
    setSubmitting(true);
    const res = await fetch(`/api/facilities/${facilityId}/pest-events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ facilityAreaId: areaId, pestSpecies: species, scientificName, severity, notes, x, y }),
    });
    if (res.ok) {
      const row = await res.json();
      markEngaged();
      router.push(`/app/facilities/${facilityId}/pest-events/${row.id}`);
    } else {
      setSubmitting(false);
      setPlacingLocation(false);
    }
  }

  if (placingLocation) {
    return <LocationPicker facilities={facilities} onConfirm={handleConfirmLocation} onCancel={() => setPlacingLocation(false)} />;
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setPlacingLocation(true);
      }}
      className="card flex flex-col gap-3 p-4"
    >
      <SpeciesPicker
        kind="pest"
        value={species}
        onChange={(name, latin) => {
          setSpecies(name);
          setScientificName(latin);
        }}
        placeholder="Pest species (e.g. spider mites)"
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
        disabled={submitting || !species.trim() || facilities.length === 0}
        className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-[#0B1626] disabled:opacity-50"
      >
        {submitting ? "Creating…" : "Continue to place location"}
      </button>
    </form>
  );
}
