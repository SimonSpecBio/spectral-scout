"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { queuedFetch } from "@/lib/offline-queue";
import { markEngaged } from "@/lib/pwa-engagement";
import FormField from "../FormField";
import LocationPicker, { type PickerFacility } from "../LocationPicker";
import SpeciesPicker from "../SpeciesPicker";
import SubmitButton from "../SubmitButton";

type Severity = "low" | "moderate" | "high" | "severe";
const SEVERITIES: Severity[] = ["low", "moderate", "high", "severe"];
const DRAFT_KEY = "scout-new-event-draft";

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

  // Same draft-recovery pattern MonitoringFlow uses: a scouting handoff's
  // prefill only applies when there's no in-progress draft to restore
  // instead, so a saved draft always wins over stale handoff defaults.
  const [draft] = useState(() => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });

  const [species, setSpecies] = useState(typeof draft?.species === "string" ? draft.species : "");
  const [scientificName, setScientificName] = useState<string | null>(
    typeof draft?.scientificName === "string" ? draft.scientificName : null
  );
  const [severity, setSeverity] = useState<Severity>(
    draft?.severity && SEVERITIES.includes(draft.severity) ? draft.severity : handoff ? severityFromHandoff(handoff) : "moderate"
  );
  const [notes, setNotes] = useState(
    typeof draft?.notes === "string"
      ? draft.notes
      : handoff
        ? `Scouting handoff: ${handoff.pestCount}/${handoff.sampleSize} checked over threshold.`
        : ""
  );
  const [submitting, setSubmitting] = useState(false);
  const [placingLocation, setPlacingLocation] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ species, scientificName, severity, notes }));
    } catch {
      /* storage full or unavailable */
    }
  }, [species, scientificName, severity, notes]);

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
      localStorage.removeItem(DRAFT_KEY);
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
        step={{ current: 2, total: 2 }}
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-end">
        <button type="button" onClick={() => router.back()} className="text-sm text-[var(--text-dim)]">
          Cancel
        </button>
      </div>
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
        <FormField label="Notes (optional)">
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Notes (optional)"
            className="rounded-md border border-[var(--border)] bg-transparent px-3 py-2 text-sm"
          />
        </FormField>
        <SubmitButton disabled={submitting || !species.trim() || facilities.length === 0} variant="floating">
          {submitting ? "Logging…" : "Log location"}
        </SubmitButton>
        <div className="text-center text-xs text-[var(--text-dim)]">Draft saves automatically as you go.</div>
      </form>
    </div>
  );
}
