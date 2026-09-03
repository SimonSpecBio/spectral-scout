"use client";

import { useState } from "react";
import { displayNameForPestSpecies, findPestProgram } from "@/lib/treatments-catalog";

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
  infestedPctThreshold: number | null;
  densityThreshold: number | null;
  presenceTriggeredOverride: boolean | null;
  createdAt: string;
}

// Mirrors lib/scout-metric.ts's isOverThreshold resolution (catalog
// default, then org override) so this settings list shows the same
// answer the alert engine actually uses -- not just what's stored.
function resolvedPresenceTriggered(row: Pick<ThresholdRow, "pestSpecies" | "presenceTriggeredOverride">): boolean {
  if (row.presenceTriggeredOverride !== null) return row.presenceTriggeredOverride;
  return findPestProgram(row.pestSpecies)?.presenceTriggered ?? false;
}
interface TrapThresholdRow {
  id: string;
  pestSpecies: string;
  catchPerDayThreshold: number;
  createdAt: string;
}

export default function CatalogClient({
  isOwner,
  initialSpecies,
  initialThresholds,
  initialTrapThresholds,
  defaultPctThreshold,
  defaultDensityThreshold,
  defaultCatchPerDayThreshold,
}: {
  isOwner: boolean;
  initialSpecies: SpeciesRow[];
  initialThresholds: ThresholdRow[];
  initialTrapThresholds: TrapThresholdRow[];
  defaultPctThreshold: number;
  defaultDensityThreshold: number;
  defaultCatchPerDayThreshold: number;
}) {
  const [species, setSpecies] = useState(initialSpecies);
  const [thresholds, setThresholds] = useState(initialThresholds);
  const [trapThresholds, setTrapThresholds] = useState(initialTrapThresholds);

  const [trapThresholdName, setTrapThresholdName] = useState("");
  const [trapThresholdValue, setTrapThresholdValue] = useState("");
  const [trapThresholdSubmitting, setTrapThresholdSubmitting] = useState(false);
  const [trapThresholdError, setTrapThresholdError] = useState<string | null>(null);

  const [speciesName, setSpeciesName] = useState("");
  const [speciesLatin, setSpeciesLatin] = useState("");
  const [speciesKind, setSpeciesKind] = useState<"pest" | "pathogen">("pest");
  const [speciesSubmitting, setSpeciesSubmitting] = useState(false);
  const [speciesError, setSpeciesError] = useState<string | null>(null);

  const [thresholdName, setThresholdName] = useState("");
  const [thresholdPct, setThresholdPct] = useState("");
  const [thresholdDensity, setThresholdDensity] = useState("");
  // null = use the catalog default (or generic numeric fallback) for
  // whatever name is typed above; true/false = force presence-triggered
  // mode on or off regardless of what the catalog says.
  const [thresholdPresenceOverride, setThresholdPresenceOverride] = useState<boolean | null>(null);
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
    const res = await fetch("/api/thresholds", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pestSpecies: thresholdName,
        infestedPctThreshold: thresholdPct || null,
        densityThreshold: thresholdDensity || null,
        presenceTriggeredOverride: thresholdPresenceOverride,
      }),
    });
    if (res.ok) {
      const row = await res.json();
      setThresholds((prev) => {
        const withoutMatch = prev.filter((t) => t.id !== row.id);
        return [...withoutMatch, row].sort((a, b) => a.pestSpecies.localeCompare(b.pestSpecies));
      });
      setThresholdName("");
      setThresholdPct("");
      setThresholdDensity("");
      setThresholdPresenceOverride(null);
    } else {
      const body = await res.json().catch(() => ({}));
      setThresholdError(body.error ?? "Couldn't save threshold.");
    }
    setThresholdSubmitting(false);
  }

  async function removeThreshold(row: ThresholdRow) {
    if (!confirm(`Remove the monitoring threshold for "${displayNameForPestSpecies(row.pestSpecies)}"?`)) return;
    const res = await fetch(`/api/thresholds/${row.id}`, { method: "DELETE" });
    if (res.ok) setThresholds((prev) => prev.filter((t) => t.id !== row.id));
  }

  async function addTrapThreshold(e: React.FormEvent) {
    e.preventDefault();
    setTrapThresholdSubmitting(true);
    setTrapThresholdError(null);
    const res = await fetch("/api/trap-thresholds", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pestSpecies: trapThresholdName, catchPerDayThreshold: trapThresholdValue }),
    });
    if (res.ok) {
      const row = await res.json();
      setTrapThresholds((prev) => {
        const withoutMatch = prev.filter((t) => t.id !== row.id);
        return [...withoutMatch, row].sort((a, b) => a.pestSpecies.localeCompare(b.pestSpecies));
      });
      setTrapThresholdName("");
      setTrapThresholdValue("");
    } else {
      const body = await res.json().catch(() => ({}));
      setTrapThresholdError(body.error ?? "Couldn't save threshold.");
    }
    setTrapThresholdSubmitting(false);
  }

  async function removeTrapThreshold(row: TrapThresholdRow) {
    if (!confirm(`Remove the trap catch/day threshold for "${displayNameForPestSpecies(row.pestSpecies)}"?`)) return;
    const res = await fetch(`/api/trap-thresholds/${row.id}`, { method: "DELETE" });
    if (res.ok) setTrapThresholds((prev) => prev.filter((t) => t.id !== row.id));
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
            What triggers a monitoring alert for a species -- % infested for a Plant sampling leaf-by-leaf walk, mean pests/leaf for a
            Counts tally (the two aren&apos;t the same scale, so each has its own threshold). Anything not listed uses the defaults,{" "}
            {defaultPctThreshold}% / {defaultDensityThreshold} per leaf.
          </p>
        </div>

        {thresholds.length > 0 && (
          <div className="card flex flex-col divide-y divide-[var(--border)]">
            {thresholds.map((t) => (
              <div key={t.id} className="flex items-center justify-between gap-3 p-3.5">
                <div className="text-sm">{displayNameForPestSpecies(t.pestSpecies)}</div>
                <div className="flex items-center gap-3">
                  <span className="label-mono">
                    {resolvedPresenceTriggered(t)
                      ? "Alert on any detection"
                      : `${t.infestedPctThreshold ?? defaultPctThreshold}% · ${t.densityThreshold ?? defaultDensityThreshold}/leaf`}
                  </span>
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
            <div className="flex flex-col gap-1">
              <span className="text-xs text-[var(--text-dim)]">
                Alert mode -- some species (mealybug, broad mite, whitefly, botrytis) default to alerting on any
                detection instead of a numeric threshold, since no defensible number exists for them.
              </span>
              <div className="flex gap-2">
                {(
                  [
                    { value: null, label: "Catalog default" },
                    { value: true, label: "Any detection" },
                    { value: false, label: "Numeric" },
                  ] as const
                ).map((opt) => (
                  <button
                    type="button"
                    key={String(opt.value)}
                    onClick={() => setThresholdPresenceOverride(opt.value)}
                    className={`flex-1 rounded-md border px-2 py-1.5 text-xs ${
                      thresholdPresenceOverride === opt.value
                        ? "border-[var(--accent)] text-[var(--accent)]"
                        : "border-[var(--border)] text-[var(--text-dim)]"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
            {thresholdPresenceOverride !== true && (
              <>
                <label className="flex items-center justify-between gap-2 text-sm text-[var(--text-dim)]">
                  Occupancy threshold (Plant sampling)
                  <input
                    value={thresholdPct}
                    onChange={(e) => setThresholdPct(e.target.value)}
                    type="number"
                    min="0"
                    max="100"
                    step="0.1"
                    placeholder={`${defaultPctThreshold}%`}
                    className="w-24 rounded-md border border-[var(--border)] bg-transparent px-3 py-2 text-sm text-[var(--text)]"
                  />
                </label>
                <label className="flex items-center justify-between gap-2 text-sm text-[var(--text-dim)]">
                  Density threshold (Counts, pests/leaf)
                  <input
                    value={thresholdDensity}
                    onChange={(e) => setThresholdDensity(e.target.value)}
                    type="number"
                    min="0"
                    step="0.1"
                    placeholder={`${defaultDensityThreshold}`}
                    className="w-24 rounded-md border border-[var(--border)] bg-transparent px-3 py-2 text-sm text-[var(--text)]"
                  />
                </label>
              </>
            )}
            {thresholdError && <div className="text-sm text-[var(--danger)]">{thresholdError}</div>}
            <button
              type="submit"
              disabled={
                thresholdSubmitting ||
                !thresholdName.trim() ||
                (thresholdPresenceOverride !== true && !thresholdPct && !thresholdDensity && thresholdPresenceOverride === null)
              }
              className="self-start rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-[var(--on-accent)] disabled:opacity-50"
            >
              {thresholdSubmitting ? "Saving…" : "Save threshold"}
            </button>
          </form>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <div>
          <div className="text-sm font-medium">Trap catch thresholds</div>
          <p className="text-xs text-[var(--text-dim)]">
            Catches per trap per day that trigger a trap-spike suggestion for a species. Anything not listed uses the default,{" "}
            {defaultCatchPerDayThreshold}/day.
          </p>
        </div>

        {trapThresholds.length > 0 && (
          <div className="card flex flex-col divide-y divide-[var(--border)]">
            {trapThresholds.map((t) => (
              <div key={t.id} className="flex items-center justify-between gap-3 p-3.5">
                <div className="text-sm">{displayNameForPestSpecies(t.pestSpecies)}</div>
                <div className="flex items-center gap-3">
                  <span className="label-mono">{t.catchPerDayThreshold}/day</span>
                  {isOwner && (
                    <button onClick={() => removeTrapThreshold(t)} className="text-xs text-[var(--danger)]">
                      Remove
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {isOwner && (
          <form onSubmit={addTrapThreshold} className="card flex flex-col gap-2 p-4">
            <input
              value={trapThresholdName}
              onChange={(e) => setTrapThresholdName(e.target.value)}
              placeholder="Species name (matches by name)"
              required
              className="rounded-md border border-[var(--border)] bg-transparent px-3 py-2 text-sm"
            />
            <label className="flex items-center justify-between gap-2 text-sm text-[var(--text-dim)]">
              Catch/day threshold
              <input
                value={trapThresholdValue}
                onChange={(e) => setTrapThresholdValue(e.target.value)}
                type="number"
                min="0"
                step="0.1"
                required
                placeholder={`${defaultCatchPerDayThreshold}`}
                className="w-24 rounded-md border border-[var(--border)] bg-transparent px-3 py-2 text-sm text-[var(--text)]"
              />
            </label>
            {trapThresholdError && <div className="text-sm text-[var(--danger)]">{trapThresholdError}</div>}
            <button
              type="submit"
              disabled={trapThresholdSubmitting || !trapThresholdName.trim() || !trapThresholdValue}
              className="self-start rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-[var(--on-accent)] disabled:opacity-50"
            >
              {trapThresholdSubmitting ? "Saving…" : "Save threshold"}
            </button>
          </form>
        )}
      </section>
    </div>
  );
}
