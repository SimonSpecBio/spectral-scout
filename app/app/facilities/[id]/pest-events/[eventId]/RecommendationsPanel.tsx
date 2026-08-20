"use client";

import { useState } from "react";
import { matchInventoryStock, type StockStatus } from "@/lib/recommendations";
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
// Disease Event's species matched against lib/treatments-catalog.ts's
// real program data, one "Apply" action per option that logs the
// treatment and auto-schedules the recheck/release follow-up in one call
// (app/api/.../apply-program). Deliberately NOT wired to auto-run on
// event creation -- always an explicit tap, and the restricted (chemical
// last-resort) tier stays collapsed behind its own toggle with an
// explicit warning rather than sitting level with everything else. No
// jurisdiction/crop approved-list gate exists yet (see
// lib/treatments-catalog.ts's comment) -- this is pre-launch, real
// compliance work still needs to land before this is public.
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
  const [showRestricted, setShowRestricted] = useState(false);
  const [applying, setApplying] = useState<string | null>(null);
  const [applied, setApplied] = useState<Record<string, string>>({}); // name -> confirmation message

  const program = findPestProgram(pestSpecies);
  if (!program) {
    return (
      <div className="card p-4 text-sm text-[var(--text-dim)]">
        No preset program for &ldquo;{pestSpecies}&rdquo; yet -- log treatments manually from the Treatments tab.
      </div>
    );
  }

  async function apply(kind: "biocontrol" | "biopesticide" | "chemical", name: string) {
    setApplying(name);
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
    }
    setApplying(null);
  }

  function OptionRow({
    kind,
    name,
    sub,
    caution,
  }: {
    kind: "biocontrol" | "biopesticide" | "chemical";
    name: string;
    sub: string;
    caution?: string;
  }) {
    const stock = matchInventoryStock(name, inventory);
    return (
      <div className="flex flex-col gap-1.5 py-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="text-sm">{name}</div>
            <div className="label-mono">{sub}</div>
          </div>
          <span className="label-mono shrink-0" style={{ color: STOCK_COLOR[stock] }}>
            {STOCK_LABEL[stock]}
          </span>
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

  const biocontrols = program.primaryBiocontrol.map((id) => AGENTS.find((a) => a.id === id)).filter((a) => !!a);
  const biopesticides = program.biopesticideRotation.map((id) => PRODUCTS.find((p) => p.id === id)).filter((p) => !!p);
  const chemicals = program.chemicalLastResort.map((id) => PRODUCTS.find((p) => p.id === id)).filter((p) => !!p);

  return (
    <div className="flex flex-col gap-4">
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

      {biocontrols.length > 0 && (
        <div className="card flex flex-col divide-y divide-[var(--border)] p-4">
          <div className="label-mono pb-1">Primary biocontrol</div>
          {biocontrols.map((a) => (
            <OptionRow key={a!.id} kind="biocontrol" name={a!.name} sub={`${a!.typicalRate} · reintro every ${a!.reintroDays}d`} caution={a!.notes} />
          ))}
        </div>
      )}

      {biopesticides.length > 0 && (
        <div className="card flex flex-col divide-y divide-[var(--border)] p-4">
          <div className="label-mono pb-1">Biopesticide rotation</div>
          {biopesticides.map((p) => (
            <OptionRow key={p!.id} kind="biopesticide" name={p!.name} sub={`REI ${p!.reiHours}h · PHI ${p!.phiDays}d`} caution={p!.cautions} />
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

      {chemicals.length > 0 && (
        <div className="flex flex-col gap-2">
          <button onClick={() => setShowRestricted((v) => !v)} className="self-start text-xs text-[var(--text-dim)]">
            {showRestricted ? "Hide" : "Show"} restricted chemical options ({chemicals.length})
          </button>
          {showRestricted && (
            <div className="flex flex-col gap-2">
              <div className="rounded-md p-3 text-xs" style={{ background: "var(--danger-bg)", color: "var(--danger)" }}>
                Restricted or prohibited on cannabis in many markets -- verify legality in your jurisdiction before
                use. Not a substitute for checking the current product label.
              </div>
              <div className="card flex flex-col divide-y divide-[var(--border)] p-4">
                {chemicals.map((p) => (
                  <OptionRow key={p!.id} kind="chemical" name={p!.name} sub={`REI ${p!.reiHours}h · PHI ${p!.phiDays}d`} caution={p!.cautions} />
                ))}
              </div>
            </div>
          )}
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
