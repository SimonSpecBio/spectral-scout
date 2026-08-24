"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { flowGrid, grid2d, singleZone, type GeneratedZone } from "@/lib/layout-presets";
import FormField from "@/app/app/FormField";
import { Stepper } from "@/app/app/Stepper";
import SubmitButton from "@/app/app/SubmitButton";

type Preset =
  | "home_single_tent"
  | "home_multi_tent"
  | "home_room"
  | "commercial_benches"
  | "commercial_bays"
  | "commercial_rack";

const PRESETS: { value: Preset; label: string; group: "home" | "commercial" }[] = [
  { value: "home_single_tent", label: "Single tent", group: "home" },
  { value: "home_multi_tent", label: "Multiple tents", group: "home" },
  { value: "home_room", label: "Single room, no tents", group: "home" },
  { value: "commercial_benches", label: "Row of benches", group: "commercial" },
  { value: "commercial_bays", label: "Greenhouse bays", group: "commercial" },
  { value: "commercial_rack", label: "Vertical rack / tiers", group: "commercial" },
];

function zonesFor(preset: Preset, count: number, secondary: number): GeneratedZone[] {
  switch (preset) {
    case "home_single_tent":
      return singleZone("Tent");
    case "home_multi_tent":
      return flowGrid(count, 4, (i) => `Tent ${i + 1}`);
    case "home_room":
      return count <= 1 ? singleZone("Room") : flowGrid(count, 4, (i) => `Zone ${i + 1}`);
    case "commercial_benches":
      return grid2d(2, Math.max(1, Math.ceil(count / 2)), (r, c) => `Bench ${String.fromCharCode(65 + r)}${c + 1}`);
    case "commercial_bays":
      return flowGrid(count, 5, (i) => `Bay ${i + 1}`);
    case "commercial_rack":
      return grid2d(count, secondary, (r, c) => `Tier ${r + 1}, Section ${c + 1}`);
  }
}

// Tier 1 of the map redesign (map-redesign-plan.md): a grower gets a real,
// usable set of labeled zones without ever drawing a shape -- shown once,
// only when an area has no zones yet (MapEditor.tsx's freehand tools are
// retired; this is the only way new zones get created now). Generates
// plain rect shapes through the existing objects endpoint, same shape
// vocabulary MapEditor already renders -- nothing else has to change to
// display them.
export default function LayoutPicker({ facilityId, areaId }: { facilityId: string; areaId: string }) {
  const router = useRouter();
  const [preset, setPreset] = useState<Preset | null>(null);
  const [count, setCount] = useState(2);
  const [secondary, setSecondary] = useState(4);
  const [generating, setGenerating] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Tier 2: a real photo/floor-plan/satellite image with pins dropped
  // directly on it, no preset grid at all -- reuses the same background-
  // upload endpoint MapEditor's "edit" mode already has, just reachable
  // before any zones exist too, since the old gate (objects.length === 0)
  // would otherwise force every area through a Tier-1 preset first even
  // for a grower who has a real photo ready to go.
  async function uploadPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    const form = new FormData();
    form.append("file", file);
    try {
      const res = await fetch(`/api/facilities/${facilityId}/areas/${areaId}/background`, { method: "POST", body: form });
      if (res.ok) {
        router.refresh();
      } else {
        setError("Couldn't upload that photo. Check your connection and try again.");
      }
    } catch {
      setError("Couldn't upload that photo. Check your connection and try again.");
    }
    setUploading(false);
  }

  async function generate() {
    if (!preset) return;
    setGenerating(true);
    setError(null);
    const zones = zonesFor(preset, count, secondary);
    try {
      const results = await Promise.all(
        zones.map((z) =>
          fetch(`/api/facilities/${facilityId}/areas/${areaId}/objects`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ shapeType: "rect", geometry: z.geometry, label: z.label }),
          })
        )
      );
      if (results.every((r) => r.ok)) {
        router.refresh();
      } else {
        setError("Couldn't create the layout. Check your connection and try again.");
      }
    } catch {
      setError("Couldn't create the layout. Check your connection and try again.");
    }
    setGenerating(false);
  }

  const needsCount = preset != null && preset !== "home_single_tent";
  const needsSecondary = preset === "commercial_rack";

  return (
    <div className="card flex flex-col gap-4 p-4">
      <div>
        <div className="text-sm font-medium">Set up this site&apos;s layout</div>
        <p className="mt-1 text-xs text-[var(--text-dim)]">
          Pick what matches your space -- no drawing needed. You can reposition or remove zones after.
        </p>
      </div>

      <FormField label="Layout">
        <div className="flex flex-col gap-2">
          <div className="label-mono">Home</div>
          {PRESETS.filter((p) => p.group === "home").map((p) => (
            <button
              key={p.value}
              type="button"
              onClick={() => setPreset(p.value)}
              className={`rounded-md border px-3 py-2 text-left text-sm ${
                preset === p.value ? "border-[var(--accent)] text-[var(--accent)]" : "border-[var(--border)] text-[var(--text-dim)]"
              }`}
            >
              {p.label}
            </button>
          ))}
          <div className="label-mono mt-2">Commercial</div>
          {PRESETS.filter((p) => p.group === "commercial").map((p) => (
            <button
              key={p.value}
              type="button"
              onClick={() => setPreset(p.value)}
              className={`rounded-md border px-3 py-2 text-left text-sm ${
                preset === p.value ? "border-[var(--accent)] text-[var(--accent)]" : "border-[var(--border)] text-[var(--text-dim)]"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </FormField>

      {needsCount && (
        <FormField
          label={
            preset === "commercial_rack"
              ? "Number of tiers"
              : preset === "commercial_benches"
                ? "Number of benches"
                : preset === "commercial_bays"
                  ? "Number of bays"
                  : preset === "home_room"
                    ? "Number of zones (optional -- leave at 1 for no subdivisions)"
                    : "Number of tents"
          }
          layout="row"
        >
          <Stepper value={count} onChange={setCount} min={1} max={20} />
        </FormField>
      )}
      {needsSecondary && (
        <FormField label="Sections per tier" layout="row">
          <Stepper value={secondary} onChange={setSecondary} min={1} max={12} />
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

      <SubmitButton disabled={!preset || generating} onClick={generate} variant="compact">
        {generating ? "Setting up…" : "Generate layout"}
      </SubmitButton>

      <div className="flex items-center gap-3 text-xs text-[var(--text-dim)]">
        <div className="h-px flex-1 bg-[var(--border)]" />
        or
        <div className="h-px flex-1 bg-[var(--border)]" />
      </div>

      <label className="cursor-pointer self-start rounded-md border border-[var(--border)] px-3 py-2 text-sm text-[var(--text-dim)]">
        {uploading ? "Uploading…" : "Upload a real photo or floor plan instead"}
        <input type="file" accept="image/*" className="hidden" onChange={uploadPhoto} disabled={uploading} />
      </label>
    </div>
  );
}
