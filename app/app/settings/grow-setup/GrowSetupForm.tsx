"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { GROWER_TYPE_LABEL, type GrowerType } from "@/lib/grower-type";
import FormField from "../../FormField";
import SubmitButton from "../../SubmitButton";

const HOME_TYPES: GrowerType[] = ["home_single_tent", "home_multi_tent", "home_room"];

export default function GrowSetupForm({
  isOwner,
  initialGrowerType,
  initialGrowSizeLabel,
}: {
  isOwner: boolean;
  initialGrowerType: GrowerType | null;
  initialGrowSizeLabel: string;
}) {
  const router = useRouter();
  const [growerType, setGrowerType] = useState<GrowerType | null>(initialGrowerType);
  const [growSizeLabel, setGrowSizeLabel] = useState(initialGrowSizeLabel);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function save() {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch("/api/organizations/grow-setup", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ growerType, growSizeLabel: growSizeLabel.trim() || null }),
      });
      if (res.ok) {
        setSaved(true);
        router.refresh();
      } else {
        setError("Couldn't save. Check your connection and try again.");
      }
    } catch {
      setError("Couldn't save. Check your connection and try again.");
    }
    setSaving(false);
  }

  if (!isOwner) {
    return <div className="card p-4 text-sm text-[var(--text-dim)]">Only the account owner can change this.</div>;
  }

  const isHomeSelected = growerType != null && HOME_TYPES.includes(growerType);

  return (
    <div className="flex flex-col gap-4">
      <FormField label="What does your grow look like?">
        <div className="flex flex-col gap-2">
          {HOME_TYPES.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setGrowerType(growerType === t ? null : t)}
              className={`rounded-md border px-3 py-2 text-left text-sm ${
                growerType === t ? "border-[var(--accent)] text-[var(--accent)]" : "border-[var(--border)] text-[var(--text-dim)]"
              }`}
            >
              {GROWER_TYPE_LABEL[t]}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setGrowerType(growerType === "commercial" ? null : "commercial")}
            className={`rounded-md border px-3 py-2 text-left text-sm ${
              growerType === "commercial" ? "border-[var(--accent)] text-[var(--accent)]" : "border-[var(--border)] text-[var(--text-dim)]"
            }`}
          >
            {GROWER_TYPE_LABEL.commercial}
          </button>
        </div>
      </FormField>

      {isHomeSelected && (
        <FormField label="Approximate size (optional)">
          <input
            value={growSizeLabel}
            onChange={(e) => setGrowSizeLabel(e.target.value)}
            placeholder="e.g. 4x4 ft tent, or ~200 sq ft -- whatever's easiest"
            className="rounded-md border border-[var(--border)] bg-transparent px-3 py-2 text-sm"
          />
        </FormField>
      )}

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
      {saved && !error && <div className="text-sm" style={{ color: "var(--success)" }}>Saved.</div>}

      <SubmitButton disabled={saving} onClick={save} variant="compact">
        {saving ? "Saving…" : "Save"}
      </SubmitButton>
    </div>
  );
}
