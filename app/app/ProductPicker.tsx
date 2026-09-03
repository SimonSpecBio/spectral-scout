"use client";

import { useState } from "react";
import { AGENTS, PRODUCTS } from "@/lib/treatments-catalog";

// Autocomplete over the real biocontrol/biopesticide catalog (lib/
// treatments-catalog.ts's AGENTS/PRODUCTS) plus the org's own Inventory
// items, same pattern as SpeciesPicker -- freeform text stays the fallback
// for anything in neither list, never blocks entry on a match. No autoFocus
// here (unlike SpeciesPicker): this field is never the first thing on a
// fresh page, so there's no first-focus-before-hydration race to guard
// against (see SpeciesPicker's mount-effect fix, 2026-09-03).
export default function ProductPicker({
  type,
  value,
  onChange,
  inventoryItems = [],
  placeholder,
}: {
  type: "biological" | "pesticide";
  value: string;
  onChange: (name: string) => void;
  inventoryItems?: { id: string; name: string }[];
  placeholder?: string;
}) {
  const [focused, setFocused] = useState(false);

  const query = value.trim().toLowerCase();
  const catalogNames = type === "biological" ? AGENTS.map((a) => a.name) : PRODUCTS.map((p) => p.name);
  const allNames = Array.from(new Set([...catalogNames, ...inventoryItems.map((i) => i.name)]));
  const options = query ? allNames.filter((n) => n.toLowerCase().includes(query)).slice(0, 6) : [];

  return (
    <div className="relative">
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setTimeout(() => setFocused(false), 150)}
        placeholder={placeholder}
        className="w-full rounded-md border border-[var(--border)] bg-transparent px-3 py-2 text-sm"
      />
      {focused && options.length > 0 && (
        <div className="card absolute left-0 right-0 top-full z-20 mt-1 flex flex-col divide-y divide-[var(--border)]">
          {options.map((name) => (
            <button
              type="button"
              key={name}
              onMouseDown={() => onChange(name)}
              className="px-3 py-2 text-left text-sm hover:bg-[var(--surface-raised)]"
            >
              {name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
