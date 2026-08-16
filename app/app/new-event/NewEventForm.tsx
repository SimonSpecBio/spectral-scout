"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { queuedFetch } from "@/lib/offline-queue";
import { markEngaged } from "@/lib/pwa-engagement";
import LocationPicker, { type PickerFacility } from "../LocationPicker";
import SpeciesPicker from "../SpeciesPicker";

type Severity = "low" | "moderate" | "high" | "severe";
const SEVERITIES: Severity[] = ["low", "moderate", "high", "severe"];

interface ScoutingHandoff {
  observationId: string;
  x: number | null;
  y: number | null;
  sampleSize: number;
  pestCount: number;
}

// A scouting alert that gets confirmed as a new event two things: don't
// make the grower re-enter what was already observed, and don't leave the
// originating session stranded unpromoted (it would otherwise keep
// re-alerting on the same over-threshold data forever, see
// lib/scouting-alerts.ts's comment). Severity defaults from the observed
// infested % using the same rough bands the severity buttons already
// imply, rather than always landing on "moderate" regardless of how bad
// the handoff data actually looked.
function severityFromHandoff(h: ScoutingHandoff): Severity {
  const pct = h.sampleSize > 0 ? (h.pestCount / h.sampleSize) * 100 : 0;
  if (pct >= 60) return "severe";
  if (pct >= 40) return "high";
  if (pct >= 20) return "moderate";
  return "low";
}

export default function NewEventForm({
  facilities,
  presetFacilityId,
  presetAreaId,
  handoff,
}: {
  facilities: PickerFacility[];
  presetFacilityId?: string;
  presetAreaId?: string;
  handoff: ScoutingHandoff | null;
}) {
  const router = useRouter();
  const [species, setSpecies] = useState("");
  const [scientificName, setScientificName] = useState<string | null>(null);
  const [severity, setSeverity] = useState<Severity>(handoff ? severityFromHandoff(handoff) : "moderate");
  const [notes, setNotes] = useState(
    handoff ? `Scouting handoff: ${handoff.pestCount}/${handoff.sampleSize} checked over threshold.` : ""
  );
  const [submitting, setSubmitting] = useState(false);
  const [placingLocation, setPlacingLocation] = useState(false);

  async function handleConfirmLocation(facilityId: string, areaId: string, x: number, y: number) {
    setSubmitting(true);
    const result = await queuedFetch(
      `/api/facilities/${facilityId}/pest-events`,
      {
        facilityAreaId: areaId,
        pestSpecies: species,
        scientificName,
        severity,
        notes,
        x,
        y,
        sourceObservationId: handoff?.observationId ?? null,
      },
      "Pest event"
    );
    if (result.ok) {
      markEngaged();
      // Queued (offline): no server-generated id exists yet to link to a
      // detail page, so land on the facility instead of the usual
      // pest-events/[id] route -- same reasoning as CountsFlow/
      // MonitoringFlow landing on a fixed route rather than one derived
      // from this response.
      if (result.queued) {
        router.push(`/app/facilities/${facilityId}`);
      } else {
        const row = result.data as { id: string };
        router.push(`/app/facilities/${facilityId}/pest-events/${row.id}`);
      }
    } else {
      setSubmitting(false);
      setPlacingLocation(false);
    }
  }

  if (placingLocation) {
    return (
      <LocationPicker
        facilities={facilities}
        initialFacilityId={presetFacilityId}
        initialAreaId={presetAreaId}
        initialX={handoff?.x ?? undefined}
        initialY={handoff?.y ?? undefined}
        onConfirm={handleConfirmLocation}
        onCancel={() => setPlacingLocation(false)}
      />
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setPlacingLocation(true);
      }}
      className="card flex flex-col gap-3 p-4 pb-24"
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
        className="btn-location fixed inset-x-4 bottom-24 z-40 mx-auto max-w-xs rounded-xl py-3.5 text-sm font-medium shadow-lg disabled:opacity-50 lg:bottom-6"
      >
        {submitting ? "Logging…" : "Log location"}
      </button>
    </form>
  );
}
