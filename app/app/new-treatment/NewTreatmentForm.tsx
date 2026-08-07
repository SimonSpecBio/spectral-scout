"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import LocationPlacement from "../LocationPlacement";

const TYPES = ["biological", "pesticide", "spectral_light"] as const;

export default function NewTreatmentForm({
  facilityId,
  items,
}: {
  facilityId: string;
  items: { id: string; name: string; unit: string; quantity: number }[];
}) {
  const router = useRouter();
  const [type, setType] = useState<(typeof TYPES)[number]>("biological");
  const [inventoryItemId, setInventoryItemId] = useState("");
  const [quantityUsed, setQuantityUsed] = useState<number | "">("");
  const [targetPest, setTargetPest] = useState("");
  const [minutesSpent, setMinutesSpent] = useState<number | "">("");
  const [notes, setNotes] = useState("");
  const [placingLocation, setPlacingLocation] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const selectedItem = items.find((i) => i.id === inventoryItemId);

  async function submit(x: number, y: number) {
    setSubmitting(true);
    const res = await fetch(`/api/facilities/${facilityId}/treatments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type,
        inventoryItemId: inventoryItemId || null,
        product: selectedItem?.name ?? null,
        quantityUsed: quantityUsed === "" ? null : quantityUsed,
        targetPest: targetPest || null,
        minutesSpent: minutesSpent === "" ? null : minutesSpent,
        notes: notes || null,
        x,
        y,
      }),
    });
    if (res.ok) {
      router.push("/app/rei-phi");
    } else {
      setSubmitting(false);
      setPlacingLocation(false);
    }
  }

  if (placingLocation) {
    return <LocationPlacement onConfirm={submit} onCancel={() => setPlacingLocation(false)} />;
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setPlacingLocation(true);
      }}
      className="flex flex-col gap-4"
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
        )}
        {inventoryItemId && (
          <label className="flex items-center justify-between text-sm text-[var(--text-dim)]">
            Quantity used
            <input
              type="number"
              inputMode="decimal"
              min={0}
              value={quantityUsed}
              onChange={(e) => setQuantityUsed(e.target.value === "" ? "" : Number(e.target.value))}
              className="w-24 rounded-md border border-[var(--border)] bg-transparent px-3 py-1.5 text-right text-[var(--text)]"
            />
          </label>
        )}
        <input
          value={targetPest}
          onChange={(e) => setTargetPest(e.target.value)}
          placeholder="Target pest (optional)"
          className="rounded-md border border-[var(--border)] bg-transparent px-3 py-2 text-sm"
        />
        <label className="flex items-center justify-between text-sm text-[var(--text-dim)]">
          Time spent (minutes, for labor tracking)
          <input
            type="number"
            inputMode="numeric"
            min={0}
            value={minutesSpent}
            onChange={(e) => setMinutesSpent(e.target.value === "" ? "" : Number(e.target.value))}
            className="w-24 rounded-md border border-[var(--border)] bg-transparent px-3 py-1.5 text-right text-[var(--text)]"
          />
        </label>
        <input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Notes (optional)"
          className="rounded-md border border-[var(--border)] bg-transparent px-3 py-2 text-sm"
        />
      </div>

      <button
        type="submit"
        disabled={submitting}
        className="rounded-md bg-[var(--accent)] px-4 py-3 text-sm font-medium text-[#0B1626] disabled:opacity-50"
      >
        {submitting ? "Saving…" : "Continue to place location"}
      </button>
    </form>
  );
}
