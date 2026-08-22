"use client";

import { useState } from "react";
import { matchInventoryStock, type StockStatus } from "@/lib/recommendations";
import { buildSpectralLightProtocol } from "@/lib/spectral-light";
import { AGENTS, findPestProgram, PRODUCTS } from "@/lib/treatments-catalog";

const STOCK_LABEL: Record<StockStatus, string> = { in_stock: "IN STOCK", low: "LOW STOCK", out: "OUT OF STOCK", unknown: "NOT IN INVENTORY" };
const STOCK_COLOR: Record<StockStatus, string> = {
  in_stock: "var(--success)",
  // Low is a caution (still usable, reorder soon) -- out is a hard blocker
  // (can't apply it at all). Both used to map to the same --danger red,
  // collapsing a "plan ahead" signal into a "you can't do this" one.
  low: "var(--warning)",
  out: "var(--danger)",
  unknown: "var(--text-faint)",
};

interface InventoryRow {
  name: string;
  quantity: number;
  reorderLevel: number | null;
}

// The recommendation engine's UI (TREATMENTS.md/SCHEDULING.md): a Pest/
// Disease Event's species matched against lib/treatments-catalog.ts's real
// program data. Per Simon's taxonomy decision (2026-08-21), options render
// as exactly 3 outward categories -- Beneficials / Pesticides / Spectral --
// rather than the earlier 4-way Primary-biocontrol/Biopesticide/
// (collapsed) Chemical/Cultural split. Internally, Product.type and
// Product.restricted still distinguish biopesticide vs. chemical -- that
// keeps driving REI/PHI accuracy and the "verify legality" warning, it's
// only the outward grouping that collapsed to one "Pesticides" list, sorted
// with restricted/uncertain-legality items last and each carrying its own
// inline warning rather than one banner behind a toggle. No jurisdiction/
// crop approved-list gate exists yet (see lib/treatments-catalog.ts's
// comment) -- this is pre-launch, real compliance work still needs to land
// before this is public.
export default function RecommendationsPanel({
  facilityId,
  eventId,
  pestSpecies,
  inventory,
}: {
  facilityId: string;
  eventId: string;
  pestSpecies: string;
  inventory: InventoryRow[];
}) {
  const [applying, setApplying] = useState<string | null>(null);
  const [applied, setApplied] = useState<Record<string, string>>({}); // name -> confirmation message
  const [error, setError] = useState<string | null>(null);

  const program = findPestProgram(pestSpecies);
  if (!program) {
    return (
      <div className="card p-4 text-sm text-[var(--text-dim)]">
        No preset program for &ldquo;{pestSpecies}&rdquo; yet -- log treatments manually from the Treatments tab.
      </div>
    );
  }

  async function apply(kind: "biocontrol" | "biopesticide" | "chemical" | "spectral", name: string) {
    setApplying(name);
    setError(null);
    try {
      const res = await fetch(`/api/facilities/${facilityId}/pest-events/${eventId}/apply-program`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, name }),
      });
      if (res.ok) {
        const { tasks } = await res.json();
        const recheck = tasks.find((t: { type: string }) => t.type === "monitor");
        const release = tasks.find((t: { type: string }) => t.type === "release");
        const parts = [`${name} logged`];
        if (recheck) parts.push(`recheck scheduled ${new Date(recheck.dueAt).toLocaleDateString()}`);
        if (release) parts.push(`recurring release scheduled`);
        setApplied((prev) => ({ ...prev, [name]: parts.join(" · ") }));
      } else {
        setError(`Couldn't log ${name}. Check your connection and try again.`);
      }
    } catch {
      setError(`Couldn't log ${name}. Check your connection and try again.`);
    }
    setApplying(null);
  }

  function OptionRow({
    kind,
    name,
    sub,
    caution,
    hideStock,
  }: {
    kind: "biocontrol" | "biopesticide" | "chemical" | "spectral";
    name: string;
    sub: string;
    caution?: string;
    // Spectral's hardware is never an Inventory line item -- showing "NOT
    // IN INVENTORY" next to it would read as a gap rather than what it
    // actually is (nothing to stock in the first place).
    hideStock?: boolean;
  }) {
    const stock = matchInventoryStock(name, inventory);
    return (
      <div className="flex flex-col gap-1.5 py-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="text-sm">{name}</div>
            <div className="label-mono">{sub}</div>
          </div>
          {!hideStock && (
            <span className="label-mono shrink-0" style={{ color: STOCK_COLOR[stock] }}>
              {STOCK_LABEL[stock]}
            </span>
          )}
        </div>
        {caution && <div className="text-xs text-[var(--text-dim)]">{caution}</div>}
        {applied[name] ? (
          <div className="text-xs" style={{ color: "var(--success)" }}>
            ✓ {applied[name]}
          </div>
        ) : (
          <button
            onClick={() => apply(kind, name)}
            disabled={applying === name}
            className="self-start rounded-md border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--text-dim)] disabled:opacity-50"
          >
            {applying === name ? "Applying…" : "Apply"}
          </button>
        )}
      </div>
    );
  }

  const beneficials = program.primaryBiocontrol.map((id) => AGENTS.find((a) => a.id === id)).filter((a) => !!a);

  // One merged "Pesticides" list -- biopesticideRotation first, then
  // chemicalLastResort. Per Simon's explicit call, restricted means
  // illegal here, not "usable with caution": these are filtered out
  // entirely rather than shown de-emphasized/sorted-last. Never silently
  // drop the whole tier though -- chemicalLastResort items only ever
  // existed as a last-resort option anyway, and biopesticideRotation
  // (never restricted) still renders normally.
  const pesticides = [
    ...program.biopesticideRotation.map((id) => PRODUCTS.find((p) => p.id === id)),
    ...program.chemicalLastResort.map((id) => PRODUCTS.find((p) => p.id === id)),
  ].filter((p): p is NonNullable<typeof p> => !!p && !p.restricted);

  const lightProtocol = buildSpectralLightProtocol(program);
  const SPECTRAL_LIGHT_NAME = "Spectral Pesticidal Light";

  return (
    <div className="flex flex-col gap-4">
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
      <div className="card flex flex-col divide-y divide-[var(--border)] p-4">
        <div className="label-mono pb-1">Spectral</div>
        {lightProtocol.applicability === "not_indicated" ? (
          <div className="py-3 text-sm text-[var(--text-dim)]">{lightProtocol.summary}</div>
        ) : (
          <OptionRow
            kind="spectral"
            name={SPECTRAL_LIGHT_NAME}
            sub={`REI 0h · PHI 0d · ${lightProtocol.schedule}`}
            caution={`${lightProtocol.summary} No jurisdiction/legality gate applies -- it's a light fixture, not a registered pesticide.`}
            hideStock
          />
        )}
      </div>

      {program.preventive.length > 0 && (
        <div className="card flex flex-col gap-2 p-4">
          <div className="label-mono">Preventive</div>
          <ul className="flex flex-col gap-1 text-sm text-[var(--text-dim)]">
            {program.preventive.map((p, i) => (
              <li key={i}>• {p}</li>
            ))}
          </ul>
        </div>
      )}

      {beneficials.length > 0 && (
        <div className="card flex flex-col divide-y divide-[var(--border)] p-4">
          <div className="label-mono pb-1">Beneficials</div>
          {beneficials.map((a) => (
            <OptionRow key={a!.id} kind="biocontrol" name={a!.name} sub={`${a!.typicalRate} · reintro every ${a!.reintroDays}d`} caution={a!.notes} />
          ))}
        </div>
      )}

      {pesticides.length > 0 && (
        <div className="card flex flex-col divide-y divide-[var(--border)] p-4">
          <div className="label-mono pb-1">Pesticides</div>
          {pesticides.map((p) => (
            <OptionRow key={p.id} kind={p.type === "chemical" ? "chemical" : "biopesticide"} name={p.name} sub={`REI ${p.reiHours}h · PHI ${p.phiDays}d`} caution={p.cautions} />
          ))}
        </div>
      )}

      {program.cultural.length > 0 && (
        <div className="card flex flex-col gap-2 p-4">
          <div className="label-mono">Cultural</div>
          <ul className="flex flex-col gap-1 text-sm text-[var(--text-dim)]">
            {program.cultural.map((c, i) => (
              <li key={i}>• {c}</li>
            ))}
          </ul>
        </div>
      )}

      {program.cautions.length > 0 && (
        <div className="flex flex-col gap-1 text-xs text-[var(--text-dim)]">
          {program.cautions.map((c, i) => (
            <div key={i}>⚠ {c}</div>
          ))}
        </div>
      )}
    </div>
  );
}
