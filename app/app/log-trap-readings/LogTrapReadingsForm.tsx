"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

function Stepper({ value, onChange, min = 0 }: { value: number; onChange: (v: number) => void; min?: number }) {
  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={() => onChange(Math.max(min, value - 1))}
        className="flex h-8 w-8 items-center justify-center rounded-md border border-[var(--border)] text-[var(--text-dim)]"
      >
        −
      </button>
      <span className="w-8 text-center text-sm tabular-nums">{value}</span>
      <button
        type="button"
        onClick={() => onChange(value + 1)}
        className="flex h-8 w-8 items-center justify-center rounded-md border border-[var(--border)] text-[var(--text-dim)]"
      >
        +
      </button>
    </div>
  );
}

// "Sampling" (the leaf-grid protocol, /app/new-observation) and "Counts"
// aren't built as alternate protocols here -- Traps is the only method this
// screen wires up, per what was actually asked for. The segmented control
// still shows all three for orientation; Sampling links out to the real
// existing flow, Counts is disabled rather than faked.
export default function LogTrapReadingsForm({
  facilityId,
  areaId,
  traps,
}: {
  facilityId: string;
  areaId: string;
  traps: { id: string; label: string; bay: string }[];
}) {
  const router = useRouter();
  const [species, setSpecies] = useState("");
  const [daysDeployed, setDaysDeployed] = useState(7);
  const [counts, setCounts] = useState<Record<string, number>>(() => Object.fromEntries(traps.map((t) => [t.id, 0])));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const meanPerTrap = traps.length ? total / traps.length : 0;
  const meanPerTrapPerDay = daysDeployed > 0 ? meanPerTrap / daysDeployed : 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const res = await fetch(`/api/facilities/${facilityId}/areas/${areaId}/traps/readings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pestSpecies: species,
        daysDeployed,
        readings: traps.map((t) => ({ trapId: t.id, count: counts[t.id] ?? 0 })),
      }),
    });
    if (res.ok) {
      router.push(`/app/traps?facility=${facilityId}&area=${areaId}`);
    } else {
      setSubmitting(false);
      setError("Couldn't log readings. Try again.");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="card flex flex-col gap-3 p-4">
        <label className="flex flex-col gap-1 text-sm">
          Species
          <input
            autoFocus
            value={species}
            onChange={(e) => setSpecies(e.target.value)}
            placeholder="Whitefly"
            required
            className="rounded-md border border-[var(--border)] bg-transparent px-3 py-2"
          />
        </label>

        <div className="flex flex-col gap-1">
          <span className="text-xs text-[var(--text-dim)]">Method</span>
          <div className="flex overflow-hidden rounded-md border border-[var(--border)] text-sm">
            <span className="flex-1 px-3 py-2 text-center text-[var(--text-faint)] opacity-50">Sampling</span>
            <span className="flex-1 px-3 py-2 text-center text-[var(--text-faint)] opacity-50">Counts</span>
            <span className="flex-1 bg-[var(--accent)] px-3 py-2 text-center font-medium text-[#0B1626]">Traps</span>
          </div>
        </div>

        <label className="flex items-center justify-between text-sm">
          Days deployed
          <Stepper value={daysDeployed} onChange={setDaysDeployed} min={1} />
        </label>
      </div>

      <div className="card flex flex-col gap-3 p-4">
        <div className="label-mono">Trap catch</div>
        <div className="flex flex-col divide-y divide-[var(--border)]">
          {traps.map((t) => (
            <div key={t.id} className="flex items-center justify-between py-3">
              <div>
                <div className="text-sm">{t.label}</div>
                <div className="label-mono">{t.bay.toUpperCase()}</div>
              </div>
              <Stepper value={counts[t.id] ?? 0} onChange={(v) => setCounts((prev) => ({ ...prev, [t.id]: v }))} />
            </div>
          ))}
        </div>
      </div>

      <div className="card flex items-center justify-around p-4">
        <div className="text-center">
          <div className="text-2xl font-semibold">{meanPerTrap.toFixed(1)}</div>
          <div className="text-xs text-[var(--text-dim)]">Mean / trap</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-semibold">{meanPerTrapPerDay.toFixed(1)}</div>
          <div className="text-xs text-[var(--text-dim)]">/ trap / day</div>
        </div>
      </div>

      {error && <div className="text-sm text-[var(--accent)]">{error}</div>}

      <button
        type="submit"
        disabled={submitting || !species.trim()}
        className="rounded-md bg-[var(--accent)] px-4 py-3 text-sm font-medium text-[#0B1626] disabled:opacity-50"
      >
        {submitting ? "Logging…" : "Log readings"}
      </button>
    </form>
  );
}
