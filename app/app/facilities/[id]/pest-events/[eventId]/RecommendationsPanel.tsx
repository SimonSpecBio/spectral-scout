"use client";

import { useEffect, useState } from "react";
import type { ProductBenchmark } from "@/lib/benchmarks";
import { costPerUnit, matchInventoryStock, type StockStatus } from "@/lib/recommendations";
import { buildSpectralLightProtocol } from "@/lib/spectral-light";
import { AGENTS, findPestProgram, legalityFor, PRODUCTS } from "@/lib/treatments-catalog";

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
  unit: string;
  unitCost: number | null;
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
// inline warning rather than one banner behind a toggle. A real per-state
// (CO/CA/OR) legality gate now exists (ticket 68, lib/treatments-catalog.ts's
// legalityFor()) for the subset of products with sourced per-state research
// -- a confirmed "not_legal" hides the option outright, same as `restricted`;
// "unclear"/"not_confirmed" surface as an inline caution instead of a block,
// since those mean "not yet confirmed," not "banned." Products with no
// cannabisLegalStatus data at all (the original 12) are ungated by this and
// keep relying on `restricted` alone -- this is pre-launch, real compliance
// work still needs to land before this is public.
//
// Also fetches a cross-org anonymized efficacy benchmark (ticket 83,
// lib/benchmarks.ts) for whichever two of this pest's pesticide options have
// enough pooled free-tier resolution-time data to compare honestly -- shown
// as a single "BENCHMARK" line above the Pesticides list, or nothing at all
// when there isn't yet enough data (never a fabricated/estimated number).
export default function RecommendationsPanel({
  facilityId,
  eventId,
  pestSpecies,
  inventory,
  isHomeGrower,
  orgState,
}: {
  facilityId: string;
  eventId: string;
  pestSpecies: string;
  inventory: InventoryRow[];
  // Simon's direct call (2026-08-22): home-grower accounts (single tent/
  // multiple tents/single room) get plain "do this now" action language
  // instead of the REI/PHI-hours framing -- commercial accounts keep the
  // existing technical copy as-is.
  isHomeGrower: boolean;
  // 2-letter USPS code or null (pre-onboarding / unset). Only CO/CA/OR have
  // sourced legality data today -- legalityFor() returns null for any other
  // state, so the gate simply doesn't apply rather than guessing.
  orgState: string | null;
}) {
  const [applying, setApplying] = useState<string | null>(null);
  const [applied, setApplied] = useState<Record<string, string>>({}); // name -> confirmation message
  const [error, setError] = useState<string | null>(null);
  const [benchmark, setBenchmark] = useState<ProductBenchmark | null>(null);

  // Cross-org anonymized efficacy benchmarking (ticket 83) -- fetched
  // separately from apply-program's own facility/event-scoped calls since
  // this is a pooled, aggregate-only read with no facility/org scoping at
  // all (lib/benchmarks.ts). Declared before the `!program` early return
  // below so hook order stays stable across renders regardless of whether
  // this species has a preset program.
  useEffect(() => {
    const prog = findPestProgram(pestSpecies);
    const names = prog
      ? [...prog.biopesticideRotation, ...prog.chemicalLastResort]
          .map((id) => PRODUCTS.find((p) => p.id === id))
          .filter((p): p is NonNullable<typeof p> => !!p && !p.restricted)
          .map((p) => p.name)
      : [];
    if (names.length < 2) {
      setBenchmark(null);
      return;
    }
    const params = new URLSearchParams({ pest: pestSpecies });
    names.forEach((n) => params.append("product", n));
    let cancelled = false;
    fetch(`/api/benchmarks/efficacy?${params}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled) setBenchmark(data?.benchmark ?? null);
      })
      .catch(() => {
        if (!cancelled) setBenchmark(null);
      });
    return () => {
      cancelled = true;
    };
  }, [pestSpecies]);

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
    const cost = costPerUnit(name, inventory);
    return (
      <div className="flex flex-col gap-1.5 py-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="text-sm">{name}</div>
            <div className="label-mono">
              {sub}
              {cost && ` · ~$${cost.unitCost.toFixed(2)}/${cost.unit}`}
            </div>
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
  // (never restricted) still renders normally. A confirmed per-state
  // "not_legal" (legalityFor()) is the same hard block as `restricted`;
  // "unclear"/"not_confirmed" pass through but get an inline note below.
  const pesticides = [
    ...program.biopesticideRotation.map((id) => PRODUCTS.find((p) => p.id === id)),
    ...program.chemicalLastResort.map((id) => PRODUCTS.find((p) => p.id === id)),
  ].filter((p): p is NonNullable<typeof p> => !!p && !p.restricted && legalityFor(p, orgState)?.status !== "not_legal");

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
            sub={isHomeGrower ? lightProtocol.schedule : `REI 0h · PHI 0d · ${lightProtocol.schedule}`}
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
            <OptionRow
              key={a!.id}
              kind="biocontrol"
              name={a!.name}
              sub={isHomeGrower ? `Release now, then again every ${a!.reintroDays} days` : `${a!.typicalRate} · reintro every ${a!.reintroDays}d`}
              caution={a!.notes}
            />
          ))}
        </div>
      )}

      {pesticides.length > 0 && (
        <div className="card flex flex-col divide-y divide-[var(--border)] p-4">
          <div className="label-mono pb-1">Pesticides</div>
          {benchmark && (
            <div className="py-2 text-xs text-[var(--text-dim)]">
              <span className="label-mono mr-1.5" style={{ color: "var(--success)" }}>
                BENCHMARK
              </span>
              Across {benchmark.faster.orgCount}+ free-tier growers, {benchmark.faster.product} resolved this pest {benchmark.pctFaster}% faster on
              average than {benchmark.slower.product} ({Math.round(benchmark.faster.avgDays)}d vs {Math.round(benchmark.slower.avgDays)}d to
              resolution).
            </div>
          )}
          {pesticides.map((p) => {
            const legality = legalityFor(p, orgState);
            const legalityNote =
              legality && legality.status !== "legal"
                ? `Legality in ${orgState}: ${legality.status === "unclear" ? "unclear" : "not confirmed"}${legality.note ? ` -- ${legality.note}` : ""}. Verify before use.`
                : null;
            return (
              <OptionRow
                key={p.id}
                kind={p.type === "chemical" ? "chemical" : "biopesticide"}
                name={p.name}
                sub={
                  isHomeGrower
                    ? `Wait ${p.reiHours}h before going back in, ${p.phiDays}d before harvest`
                    : `REI ${p.reiHours}h · PHI ${p.phiDays}d`
                }
                caution={legalityNote ? `${p.cautions} ${legalityNote}` : p.cautions}
              />
            );
          })}
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
