"use client";

import { useEffect, useState } from "react";
import { PEST_CATALOG } from "@/lib/pest-catalog";

interface CustomSpeciesRow {
  id: string;
  kind: "pest" | "pathogen";
  commonName: string;
  scientificName: string | null;
}

// Autocomplete over the real pest/pathogen catalog (lib/pest-catalog.ts)
// plus the org's own custom species (/api/species -- settings/catalog),
// with freeform text as the fallback for anything in neither list -- never
// blocks entry on a match. Picking a suggestion fills the latin name
// alongside the common name, same pairing the mockups show (e.g.
// "Whitefly" / "Aleyrodidae").
export default function SpeciesPicker({
  kind,
  value,
  onChange,
  placeholder,
  bare,
}: {
  kind: "pest" | "pathogen";
  value: string;
  onChange: (commonName: string, latin: string | null) => void;
  placeholder?: string;
  // Skips the input's own border/background -- for embedding inside an
  // already-styled container (e.g. DiseaseEventForm's two-field species
  // box) instead of a standalone field.
  bare?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  const [custom, setCustom] = useState<CustomSpeciesRow[]>([]);

  useEffect(() => {
    fetch("/api/species")
      .then((res) => (res.ok ? res.json() : []))
      .then(setCustom)
      .catch(() => {});
  }, []);

  const query = value.trim().toLowerCase();
  const catalogOptions = query
    ? PEST_CATALOG.filter((p) => p.kind === kind && p.commonName.toLowerCase().includes(query))
    : [];
  const customOptions = query
    ? custom
        .filter(
          (c) =>
            c.kind === kind &&
            c.commonName.toLowerCase().includes(query) &&
            !catalogOptions.some((p) => p.commonName.toLowerCase() === c.commonName.toLowerCase())
        )
        .map((c) => ({ id: c.id, commonName: c.commonName, latin: c.scientificName }))
    : [];
  const options = [...catalogOptions, ...customOptions].slice(0, 6);

  return (
    <div className="relative">
      <input
        autoFocus
        value={value}
        onChange={(e) => onChange(e.target.value, null)}
        onFocus={() => setFocused(true)}
        onBlur={() => setTimeout(() => setFocused(false), 150)}
        placeholder={placeholder}
        required
        className={
          bare
            ? "w-full bg-transparent text-sm outline-none placeholder:text-[var(--text-faint)]"
            : "w-full rounded-md border border-[var(--border)] bg-transparent px-3 py-2 text-sm"
        }
      />
      {focused && options.length > 0 && (
        <div className="card absolute left-0 right-0 top-full z-20 mt-1 flex flex-col divide-y divide-[var(--border)]">
          {options.map((p) => (
            <button
              type="button"
              key={p.id}
              onMouseDown={() => onChange(p.commonName, p.latin)}
              className="flex flex-col px-3 py-2 text-left hover:bg-[var(--surface-raised)]"
            >
              <span className="text-sm">{p.commonName}</span>
              <span className="text-xs italic text-[var(--text-dim)]">{p.latin}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
