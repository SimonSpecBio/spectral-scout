"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { queuedFetch } from "@/lib/offline-queue";
import { markEngaged } from "@/lib/pwa-engagement";
import FormField from "../FormField";
import LocationPicker, { type PickerFacility } from "../LocationPicker";
import { Stepper } from "../Stepper";
import SubmitButton from "../SubmitButton";

const TYPES = ["biological", "pesticide", "spectral_light"] as const;
const DRAFT_KEY = "scout-new-treatment-draft";

export default function NewTreatmentForm({
  facilities,
  items,
}: {
  facilities: PickerFacility[];
  items: { id: string; name: string; unit: string; quantity: number }[];
}) {
  const router = useRouter();

  // Same draft-recovery pattern as NewEventForm/DiseaseEventForm -- an
  // interrupted application-log entry (call, phone lock, backgrounded app)
  // shouldn't lose everything typed so far.
  const [draft] = useState(() => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });

  const [type, setType] = useState<(typeof TYPES)[number]>(
    draft?.type && TYPES.includes(draft.type) ? draft.type : "biological"
  );
  const [inventoryItemId, setInventoryItemId] = useState(typeof draft?.inventoryItemId === "string" ? draft.inventoryItemId : "");
  const [quantityUsed, setQuantityUsed] = useState(typeof draft?.quantityUsed === "number" ? draft.quantityUsed : 0);
  const [targetPest, setTargetPest] = useState(typeof draft?.targetPest === "string" ? draft.targetPest : "");
  const [minutesSpent, setMinutesSpent] = useState(typeof draft?.minutesSpent === "number" ? draft.minutesSpent : 0);
  const [fixtureId, setFixtureId] = useState(typeof draft?.fixtureId === "string" ? draft.fixtureId : "");
  const [minutesAfterDark, setMinutesAfterDark] = useState(typeof draft?.minutesAfterDark === "number" ? draft.minutesAfterDark : 0);
  const [durationMin, setDurationMin] = useState(typeof draft?.durationMin === "number" ? draft.durationMin : 0);
  const [pulseCount, setPulseCount] = useState(typeof draft?.pulseCount === "number" ? draft.pulseCount : 0);
  const [notes, setNotes] = useState(typeof draft?.notes === "string" ? draft.notes : "");
  const [placingLocation, setPlacingLocation] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(
        DRAFT_KEY,
        JSON.stringify({ type, inventoryItemId, quantityUsed, targetPest, minutesSpent, fixtureId, minutesAfterDark, durationMin, pulseCount, notes })
      );
    } catch {
      /* storage full or unavailable */
    }
  }, [type, inventoryItemId, quantityUsed, targetPest, minutesSpent, fixtureId, minutesAfterDark, durationMin, pulseCount, notes]);

  const selectedItem = items.find((i) => i.id === inventoryItemId);

  async function submit(facilityId: string, areaId: string, x: number, y: number) {
    setSubmitting(true);
    setError(null);
    const result = await queuedFetch(
      `/api/facilities/${facilityId}/treatments`,
      {
        type,
        inventoryItemId: inventoryItemId || null,
        product: selectedItem?.name ?? null,
        quantityUsed: quantityUsed || null,
        targetPest: targetPest || null,
        minutesSpent: minutesSpent || null,
        fixtureId: fixtureId || null,
        minutesAfterDark: minutesAfterDark || null,
        durationMin: durationMin || null,
        pulseCount: pulseCount || null,
        notes: notes || null,
        x,
        y,
      },
      "Application log"
    );
    if (result.ok) {
      markEngaged();
      localStorage.removeItem(DRAFT_KEY);
      router.push("/app/rei-phi");
    } else {
      setSubmitting(false);
      setPlacingLocation(false);
      setError("Couldn't save this application log. Check your connection and try again.");
    }
  }

  if (placingLocation) {
    return (
      <LocationPicker
        facilities={facilities}
        onConfirm={(facilityId, areaId, x, y) => submit(facilityId, areaId, x, y)}
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
        className="flex flex-col gap-4 pb-24"
      >
        <div className="card flex flex-col gap-3 p-4">
          <div className="flex gap-2">
            {TYPES.map((t) => (
              <button
                type="button"
                key={t}
                onClick={() => setType(t)}
                className={`flex-1 rounded-md border px-3 py-2 text-sm capitalize ${
                  type === t ? "border-[var(--accent)] text-[var(--accent)]" : "border-[var(--border)] text-[var(--text-dim)]"
                }`}
              >
                {t.replace("_", " ")}
              </button>
            ))}
          </div>

          {items.length > 0 && (
            <FormField label="Product from inventory (optional)">
              <select
                value={inventoryItemId}
                onChange={(e) => setInventoryItemId(e.target.value)}
                className="rounded-md border border-[var(--border)] bg-transparent px-3 py-2 text-sm"
              >
                <option value="" style={{ background: "var(--surface)" }}>
                  Product (not from inventory)
                </option>
                {items.map((i) => (
                  <option key={i.id} value={i.id} style={{ background: "var(--surface)" }}>
                    {i.name} ({i.quantity} {i.unit} in stock)
                  </option>
                ))}
              </select>
            </FormField>
          )}
          {inventoryItemId && (
            <FormField label={`Quantity used${selectedItem ? ` (${selectedItem.unit})` : ""}`} layout="row">
              {/* Whole-number taps for discrete "units" (beneficial sachets/
                  vials); a liquid/weight unit (L, gal, kg, oz) needs finer
                  steps -- a 1.0 default made a 0.1 L dose of anything
                  impossible to enter via the +/- buttons at all. */}
              <Stepper value={quantityUsed} onChange={setQuantityUsed} min={0} step={selectedItem?.unit === "units" ? 1 : 0.1} />
            </FormField>
          )}
          {type === "spectral_light" && (
            <>
              <FormField label="Fixture ID (optional)">
                <input
                  value={fixtureId}
                  onChange={(e) => setFixtureId(e.target.value)}
                  placeholder="Fixture ID (optional)"
                  className="rounded-md border border-[var(--border)] bg-transparent px-3 py-2 text-sm"
                />
              </FormField>
              <FormField label="Minutes after dark" layout="row">
                <Stepper value={minutesAfterDark} onChange={setMinutesAfterDark} min={0} step={5} />
              </FormField>
              <FormField label="Duration (minutes)" layout="row">
                <Stepper value={durationMin} onChange={setDurationMin} min={0} step={5} />
              </FormField>
              <FormField label="Pulse count" layout="row">
                <Stepper value={pulseCount} onChange={setPulseCount} min={0} step={1} />
              </FormField>
            </>
          )}
          <FormField label="Target pest (optional)">
            <input
              value={targetPest}
              onChange={(e) => setTargetPest(e.target.value)}
              placeholder="Target pest (optional)"
              className="rounded-md border border-[var(--border)] bg-transparent px-3 py-2 text-sm"
            />
          </FormField>
          <FormField label="Time spent (minutes, for labor tracking)" layout="row">
            <Stepper value={minutesSpent} onChange={setMinutesSpent} min={0} step={5} />
          </FormField>
          <FormField label="Notes (optional)">
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Notes (optional)"
              className="rounded-md border border-[var(--border)] bg-transparent px-3 py-2 text-sm"
            />
          </FormField>
        </div>

        {error && (
          <div
            className="flex items-center justify-between gap-3 rounded-md p-3.5 text-sm"
            style={{ background: "var(--danger-bg)", color: "var(--danger)" }}
          >
            {error}
            <button type="button" onClick={() => setError(null)} className="shrink-0 text-[var(--text-dim)]">
              Dismiss
            </button>
          </div>
        )}

        <SubmitButton disabled={submitting || facilities.length === 0} variant="floating">
          {submitting ? "Logging…" : "Log location"}
        </SubmitButton>
        <div className="text-center text-xs text-[var(--text-dim)]">Draft saves automatically as you go.</div>
      </form>
    </div>
  );
}
