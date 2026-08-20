"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { queuedFetch } from "@/lib/offline-queue";
import { markEngaged } from "@/lib/pwa-engagement";
import FormField from "../FormField";
import LocationPicker, { type PickerFacility } from "../LocationPicker";
import { Stepper } from "../Stepper";
import SubmitButton from "../SubmitButton";

const TYPES = ["biological", "pesticide", "spectral_light"] as const;

export default function NewTreatmentForm({
  facilities,
  items,
}: {
  facilities: PickerFacility[];
  items: { id: string; name: string; unit: string; quantity: number }[];
}) {
  const router = useRouter();
  const [type, setType] = useState<(typeof TYPES)[number]>("biological");
  const [inventoryItemId, setInventoryItemId] = useState("");
  const [quantityUsed, setQuantityUsed] = useState(0);
  const [targetPest, setTargetPest] = useState("");
  const [minutesSpent, setMinutesSpent] = useState(0);
  const [notes, setNotes] = useState("");
  const [placingLocation, setPlacingLocation] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const selectedItem = items.find((i) => i.id === inventoryItemId);

  async function submit(facilityId: string, areaId: string, x: number, y: number) {
    setSubmitting(true);
    const result = await queuedFetch(
      `/api/facilities/${facilityId}/treatments`,
      {
        type,
        inventoryItemId: inventoryItemId || null,
        product: selectedItem?.name ?? null,
        quantityUsed: quantityUsed || null,
        targetPest: targetPest || null,
        minutesSpent: minutesSpent || null,
        notes: notes || null,
        x,
        y,
      },
      "Application log"
    );
    if (result.ok) {
      markEngaged();
      router.push("/app/rei-phi");
    } else {
      setSubmitting(false);
      setPlacingLocation(false);
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
              <Stepper value={quantityUsed} onChange={setQuantityUsed} min={0} />
            </FormField>
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

        <SubmitButton disabled={submitting || facilities.length === 0} variant="floating">
          {submitting ? "Logging…" : "Log location"}
        </SubmitButton>
      </form>
    </div>
  );
}
