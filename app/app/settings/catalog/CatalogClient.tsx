"use client";

import { useState } from "react";

interface SpeciesRow {
  id: string;
  kind: "pest" | "pathogen";
  commonName: string;
  scientificName: string | null;
  createdAt: string;
}
interface ThresholdRow {
  id: string;
  pestSpecies: string;
  infestedPctThreshold: number;
  createdAt: string;
}

export default function CatalogClient({
  isOwner,
  initialSpecies,
  initialThresholds,
  defaultThreshold,
}: {
  isOwner: boolean;
  initialSpecies: SpeciesRow[];
  initialThresholds: ThresholdRow[];
  defaultThreshold: number;
}) {
  const [species, setSpecies] = useState(initialSpecies);
  const [thresholds, setThresholds] = useState(initialThresholds);

  const [speciesName, setSpeciesName] = useState("");
  const [speciesLatin, setSpeciesLatin] = useState("");
  const [speciesKind, setSpeciesKind] = useState<"pest" | "pathogen">("pest");
  const [speciesSubmitting, setSpeciesSubmitting] = useState(false);
  const [speciesError, setSpeciesError] = useState<string | null>(null);

  const [thresholdName, setThresholdName] = useState("");
  const [thresholdPct, setThresholdPct] = useState("");
  const [thresholdSubmitting, setThresholdSubmitting] = useState(false);
  const [thresholdError, setThresholdError] = useState<string | null>(null);

  async function addSpecies(e: React.FormEvent) {
    e.preventDefault();
    setSpeciesSubmitting(true);
    setSpeciesError(null);
    const res = await fetch("/api/species", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ commonName: speciesName, scientificName: speciesLatin || null, kind: speciesKind }),
    });
    if (res.ok) {
      const row = await res.json();
      setSpecies((prev) => [...prev, row].sort((a, b) => a.commonName.localeCompare(b.commonName)));
      setSpeciesName("");
      setSpeciesLatin("");
    } else {
      const body = await res.json().catch(() => ({}));
      setSpeciesError(body.error ?? "Couldn't add species.");
    }
    setSpeciesSubmitting(false);
  }

  async function removeSpecies(row: SpeciesRow) {
    if (!confirm(`Remove "${row.commonName}" from the species list?`)) return;
    const res = await fetch(`/api/species/${row.id}`, { method: "DELETE" });
    if (res.ok) setSpecies((prev) => prev.filter((s) => s.id !== row.id));
  }

  async function addThreshold(e: React.FormEvent) {
    e.preventDefault();
    setThresholdSubmitting(true);
    setThresholdError(null);
    const pct = Number(thresholdPct);
    const res = await fetch("/api/thresholds", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pestSpecies: thresholdName, infestedPctThreshold: pct }),
    });
    if (res.ok) {
      const row = await res.json();
      setThresholds((prev) => {
        const withoutMatch = prev.filter((t) => t.id !== row.id);
        return [...withoutMatch, row].sort((a, b) => a.pestSpecies.localeCompare(b.pestSpecies));
      });
      setThresholdName("");
      setThresholdPct("");
    } else {
      const body = await res.json().catch(() => ({}));
      setThresholdError(body.error ?? "Couldn't save threshold.");
    }
    setThresholdSubmitting(false);
  }

  async function removeThreshold(row: ThresholdRow) {
    if (!confirm(`Remove the monitoring threshold for "${row.pestSpecies}"?`)) return;
    const res = await fetch(`/api/thresholds/${row.id}`, { method: "DELETE" });
    if (res.ok) setThresholds((prev) => prev.filter((t) => t.id !== row.id));
  }

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-3">
        <div>
          <div className="text-sm font-medium">Custom species</div>
          <p className="text-xs text-[var(--text-dim)]">
            Names you add here show up in the suggestion list everywhere you log a pest or pathogen.
          </p>
        </div>

        {species.length > 0 && (
          <div className="card flex flex-col divide-y divide-[var(--border)]">
            {species.map((s) => (
              <div key={s.id} className="flex items-center justify-between gap-3 p-3.5">
                <div>
                  <div className="text-sm">{s.commonName}</div>
                  <div className="label-mono">
                    {s.kind.toUpperCase()}
                    {s.scientificName ? ` · ${s.scientificName}` : ""}
                  </div>
                </div>
                {isOwner && (
                  <button onClick={() => removeSpecies(s)} className="text-xs text-[var(--danger)]">
                    Remove
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {isOwner && (
          <form onSubmit={addSpecies} className="card flex flex-col gap-2 p-4">
            <div className="flex gap-2">
              {(["pest", "pathogen"] as const).map((k) => (
                <button
                  type="button"
                  key={k}
                  onClick={() => setSpeciesKind(k)}
                  className={`flex-1 rounded-md border px-3 py-1.5 text-sm capitalize ${
                    speciesKind === k ? "border-[var(--accent)] text-[var(--accent)]" : "border-[var(--border)] text-[var(--text-dim)]"
                  }`}
                >
                  {k}
                </button>
              ))}
            </div>
            <input
              value={speciesName}
              onChange={(e) => setSpeciesName(e.target.value)}
              placeholder="Common name"
              required
              className="rounded-md border border-[var(--border)] bg-transparent px-3 py-2 text-sm"
            />
            <input
              value={speciesLatin}
              onChange={(e) => setSpeciesLatin(e.target.value)}
              placeholder="Scientific name (optional)"
              className="rounded-md border border-[var(--border)] bg-transparent px-3 py-2 text-sm"
            />
            {speciesError && <div className="text-sm text-[var(--danger)]">{speciesError}</div>}
            <button
              type="submit"
              disabled={speciesSubmitting || !speciesName.trim()}
              className="self-start rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-[var(--on-accent)] disabled:opacity-50"
            >
              {speciesSubmitting ? "Adding…" : "Add species"}
            </button>
          </form>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <div>
          <div className="text-sm font-medium">Monitoring thresholds</div>
          <p className="text-xs text-[var(--text-dim)]">
            The % of infested plants that triggers a monitoring alert for a species. Anything not listed uses the default,{" "}
            {defaultThreshold}%.
          </p>
        </div>

        {thresholds.length > 0 && (
          <div className="card flex flex-col divide-y divide-[var(--border)]">
            {thresholds.map((t) => (
              <div key={t.id} className="flex items-center justify-between gap-3 p-3.5">
                <div className="text-sm">{t.pestSpecies}</div>
                <div className="flex items-center gap-3">
                  <span className="label-mono">{t.infestedPctThreshold}%</span>
                  {isOwner && (
                    <button onClick={() => removeThreshold(t)} className="text-xs text-[var(--danger)]">
                      Remove
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {isOwner && (
          <form onSubmit={addThreshold} className="card flex flex-col gap-2 p-4">
            <input
              value={thresholdName}
              onChange={(e) => setThresholdName(e.target.value)}
              placeholder="Species name (matches by name)"
              required
              className="rounded-md border border-[var(--border)] bg-transparent px-3 py-2 text-sm"
            />
            <input
              value={thresholdPct}
              onChange={(e) => setThresholdPct(e.target.value)}
              type="number"
              min="0"
              max="100"
              step="0.1"
              placeholder="Threshold %"
              required
              className="rounded-md border border-[var(--border)] bg-transparent px-3 py-2 text-sm"
            />
            {thresholdError && <div className="text-sm text-[var(--danger)]">{thresholdError}</div>}
            <button
              type="submit"
              disabled={thresholdSubmitting || !thresholdName.trim() || !thresholdPct}
              className="self-start rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-[var(--on-accent)] disabled:opacity-50"
            >
              {thresholdSubmitting ? "Saving…" : "Save threshold"}
            </button>
          </form>
        )}
      </section>
    </div>
  );
}
