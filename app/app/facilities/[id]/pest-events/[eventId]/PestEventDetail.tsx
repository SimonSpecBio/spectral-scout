"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { sparkPoints } from "@/lib/density";

type Severity = "low" | "moderate" | "high" | "severe";
type TreatmentType = "pesticide" | "biological" | "spectral_light";

interface Treatment {
  id: string;
  type: TreatmentType;
  product: string | null;
  targetPest: string | null;
  notes: string | null;
  appliedAt: string;
}

interface Photo {
  id: string;
  blobUrl: string;
  caption: string | null;
}

interface MonitoringSession {
  id: string;
  date: string;
  sampleSize: number;
  pestCount: number;
}

interface Event {
  id: string;
  kind: "pest" | "pathogen";
  pestSpecies: string;
  scientificName: string | null;
  severity: Severity;
  status: "active" | "resolved";
  notes: string | null;
  createdAt: string;
  resolvedAt: string | null;
}

const SEVERITY_COLOR: Record<Severity, string> = {
  low: "#e0d24b",
  moderate: "#e0913d",
  high: "#e0553d",
  severe: "#a3193d",
};
const TABS = ["timeline", "treatments", "photos", "monitoring", "notes"] as const;
type Tab = (typeof TABS)[number];

export default function PestEventDetail({
  facilityId,
  event,
  locationLabel,
  mapHref,
  initialTreatments,
  initialPhotos,
  initialMonitoring,
  inventoryItems,
}: {
  facilityId: string;
  event: Event;
  locationLabel: string;
  mapHref: string | null;
  initialTreatments: Treatment[];
  initialPhotos: Photo[];
  initialMonitoring: MonitoringSession[];
  inventoryItems: { id: string; name: string; unit: string; quantity: number }[];
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("timeline");
  const [status, setStatus] = useState(event.status);
  const [treatmentsList, setTreatmentsList] = useState(initialTreatments);
  const [photos, setPhotos] = useState(initialPhotos);
  const [notes, setNotes] = useState(event.notes ?? "");
  const [savingNotes, setSavingNotes] = useState(false);

  const [treatmentType, setTreatmentType] = useState<TreatmentType>("biological");
  const [inventoryItemId, setInventoryItemId] = useState("");
  const [product, setProduct] = useState("");
  const [quantityUsed, setQuantityUsed] = useState<number | "">("");
  const [minutesSpent, setMinutesSpent] = useState<number | "">("");
  const [treatmentNotes, setTreatmentNotes] = useState("");
  const [submittingTreatment, setSubmittingTreatment] = useState(false);
  const [uploading, setUploading] = useState(false);
  const selectedItem = inventoryItems.find((i) => i.id === inventoryItemId);

  const base = `/api/facilities/${facilityId}/pest-events/${event.id}`;

  async function toggleStatus() {
    const next = status === "active" ? "resolved" : "active";
    const res = await fetch(base, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next }),
    });
    if (res.ok) {
      setStatus(next);
      router.refresh();
    }
  }

  async function saveNotes() {
    setSavingNotes(true);
    await fetch(base, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notes }),
    });
    setSavingNotes(false);
  }

  async function applyTreatment(e: React.FormEvent) {
    e.preventDefault();
    setSubmittingTreatment(true);
    const res = await fetch(`${base}/treatments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: treatmentType,
        inventoryItemId: inventoryItemId || null,
        product: selectedItem?.name ?? product,
        quantityUsed: quantityUsed === "" ? null : quantityUsed,
        minutesSpent: minutesSpent === "" ? null : minutesSpent,
        notes: treatmentNotes,
      }),
    });
    if (res.ok) {
      const row = await res.json();
      setTreatmentsList((prev) => [row, ...prev]);
      setInventoryItemId("");
      setProduct("");
      setQuantityUsed("");
      setMinutesSpent("");
      setTreatmentNotes("");
      router.refresh();
    }
    setSubmittingTreatment(false);
  }

  async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const form = new FormData();
    form.append("file", file);
    const res = await fetch(`${base}/photos`, { method: "POST", body: form });
    if (res.ok) {
      const row = await res.json();
      setPhotos((prev) => [...prev, row]);
    }
    setUploading(false);
  }

  const timeline = [
    { label: "Detected", at: event.createdAt },
    ...treatmentsList.map((t) => ({ label: `${t.type.replace("_", " ")} applied${t.product ? ` -- ${t.product}` : ""}`, at: t.appliedAt })),
    ...(event.resolvedAt ? [{ label: "Resolved", at: event.resolvedAt }] : []),
  ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  // initialMonitoring arrives newest-first (matches the Monitoring tab's
  // list order); the graph needs oldest-first for a left-to-right timeline.
  const chronological = [...initialMonitoring].reverse();
  const densities = chronological.map((s) => (s.sampleSize > 0 ? (s.pestCount / s.sampleSize) * 100 : 0));
  const latestDensity = densities[densities.length - 1];
  const baselineDensity = densities[0];
  const changeVsBaseline =
    densities.length >= 2 && baselineDensity > 0 ? Math.round(((baselineDensity - latestDensity) / baselineDensity) * 100) : null;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: SEVERITY_COLOR[event.severity] }} />
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-semibold capitalize">{event.pestSpecies}</h1>
              {event.kind === "pathogen" && (
                <span className="label-mono rounded border border-[var(--border-soft)] px-1.5 py-0.5">Disease</span>
              )}
            </div>
            {event.scientificName && <div className="text-sm italic text-[var(--text-dim)]">{event.scientificName}</div>}
            <div className="text-sm text-[var(--text-dim)]">{locationLabel}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="badge capitalize" style={{ background: `${SEVERITY_COLOR[event.severity]}33`, color: SEVERITY_COLOR[event.severity] }}>
            {event.severity}
          </span>
          <button
            onClick={toggleStatus}
            className={`rounded-md border px-3 py-1.5 text-sm ${
              status === "active" ? "border-[var(--accent)] text-[var(--accent)]" : "border-[var(--border)] text-[var(--text-dim)]"
            }`}
          >
            {status === "active" ? "Mark resolved" : "Reopen"}
          </button>
        </div>
      </div>

      {densities.length > 0 && (
        <div className="card flex items-center gap-6 p-4">
          <svg width={220} height={52} className="shrink-0">
            <polyline points={sparkPoints(densities, 220, 52)} fill="none" stroke="var(--accent)" strokeWidth={2} />
          </svg>
          <div className="flex gap-6">
            <div>
              <div className="text-2xl font-semibold">{Math.round(latestDensity)}%</div>
              <div className="text-xs text-[var(--text-dim)]">latest infested</div>
            </div>
            {changeVsBaseline != null && (
              <div>
                <div className={`text-2xl font-semibold ${changeVsBaseline >= 0 ? "text-[var(--accent)]" : "text-red-400"}`}>
                  {changeVsBaseline >= 0 ? "▼" : "▲"} {Math.abs(changeVsBaseline)}%
                </div>
                <div className="text-xs text-[var(--text-dim)]">vs first session</div>
              </div>
            )}
            <div>
              <div className="text-2xl font-semibold">{densities.length}</div>
              <div className="text-xs text-[var(--text-dim)]">sessions logged</div>
            </div>
          </div>
        </div>
      )}

      <div className="flex gap-4 border-b border-[var(--border)]">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`border-b-2 px-1 pb-2 text-sm capitalize ${
              tab === t ? "border-[var(--accent)] text-[var(--accent)]" : "border-transparent text-[var(--text-dim)]"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "timeline" && (
        <div className="card flex flex-col divide-y divide-[var(--border)]">
          {timeline.map((item, i) => (
            <div key={i} className="flex items-center justify-between px-4 py-3 text-sm capitalize">
              <span>{item.label}</span>
              <span className="text-[var(--text-dim)]">{new Date(item.at).toLocaleDateString()}</span>
            </div>
          ))}
          {mapHref && (
            <Link href={mapHref} className="px-4 py-3 text-sm text-[var(--accent)]">
              View on site map →
            </Link>
          )}
        </div>
      )}

      {tab === "treatments" && (
        <div className="flex flex-col gap-4">
          <form onSubmit={applyTreatment} className="card flex flex-col gap-2 p-4">
            <div className="text-sm font-medium">Apply treatment</div>
            <div className="flex gap-2">
              {(["biological", "pesticide", "spectral_light"] as const).map((t) => (
                <button
                  type="button"
                  key={t}
                  onClick={() => setTreatmentType(t)}
                  className={`rounded-md border px-3 py-1.5 text-sm capitalize ${
                    treatmentType === t ? "border-[var(--accent)] text-[var(--accent)]" : "border-[var(--border)] text-[var(--text-dim)]"
                  }`}
                >
                  {t.replace("_", " ")}
                </button>
              ))}
            </div>
            {inventoryItems.length > 0 && (
              <select
                value={inventoryItemId}
                onChange={(e) => setInventoryItemId(e.target.value)}
                className="rounded-md border border-[var(--border)] bg-transparent px-3 py-2 text-sm"
              >
                <option value="" style={{ background: "var(--surface)" }}>
                  Product (not from inventory)
                </option>
                {inventoryItems.map((i) => (
                  <option key={i.id} value={i.id} style={{ background: "var(--surface)" }}>
                    {i.name} ({i.quantity} {i.unit} in stock)
                  </option>
                ))}
              </select>
            )}
            {!inventoryItemId && (
              <input
                value={product}
                onChange={(e) => setProduct(e.target.value)}
                placeholder="Product (e.g. Beauveria bassiana)"
                className="rounded-md border border-[var(--border)] bg-transparent px-3 py-2 text-sm"
              />
            )}
            <div className="flex gap-2">
              {inventoryItemId && (
                <input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  value={quantityUsed}
                  onChange={(e) => setQuantityUsed(e.target.value === "" ? "" : Number(e.target.value))}
                  placeholder="Qty used"
                  className="w-28 rounded-md border border-[var(--border)] bg-transparent px-3 py-2 text-sm"
                />
              )}
              <input
                type="number"
                inputMode="numeric"
                min={0}
                value={minutesSpent}
                onChange={(e) => setMinutesSpent(e.target.value === "" ? "" : Number(e.target.value))}
                placeholder="Minutes spent"
                className="flex-1 rounded-md border border-[var(--border)] bg-transparent px-3 py-2 text-sm"
              />
            </div>
            <input
              value={treatmentNotes}
              onChange={(e) => setTreatmentNotes(e.target.value)}
              placeholder="Rate, area, notes..."
              className="rounded-md border border-[var(--border)] bg-transparent px-3 py-2 text-sm"
            />
            <button
              type="submit"
              disabled={submittingTreatment}
              className="self-start rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-[#0B1626] disabled:opacity-50"
            >
              {submittingTreatment ? "Saving…" : "Save"}
            </button>
          </form>

          <div className="card flex flex-col divide-y divide-[var(--border)]">
            {treatmentsList.length === 0 && <div className="p-4 text-sm text-[var(--text-dim)]">No treatments logged yet.</div>}
            {treatmentsList.map((t) => (
              <div key={t.id} className="px-4 py-3 text-sm">
                <div className="capitalize">
                  {t.type.replace("_", " ")}
                  {t.product && ` -- ${t.product}`}
                </div>
                {t.notes && <div className="text-[var(--text-dim)]">{t.notes}</div>}
                <div className="text-xs text-[var(--text-dim)]">{new Date(t.appliedAt).toLocaleDateString()}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === "photos" && (
        <div className="flex flex-col gap-4">
          <label className="w-fit cursor-pointer rounded-md border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--text-dim)]">
            {uploading ? "Uploading…" : "Add photo"}
            <input type="file" accept="image/*" capture="environment" className="hidden" onChange={handlePhotoUpload} />
          </label>
          {photos.length === 0 ? (
            <div className="text-sm text-[var(--text-dim)]">No photos yet.</div>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {photos.map((p) => (
                // eslint-disable-next-line @next/next/no-img-element -- arbitrary Blob-hosted URLs, not a local/static asset
                <img key={p.id} src={p.blobUrl} alt={p.caption ?? ""} className="aspect-square rounded-md object-cover" />
              ))}
            </div>
          )}
        </div>
      )}

      {tab === "monitoring" && (
        <div className="flex flex-col gap-4">
          <Link
            href={`/app/facilities/${facilityId}/pest-events/${event.id}/monitoring`}
            className="w-fit rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-[#0B1626]"
          >
            Start monitoring
          </Link>

          {initialMonitoring.length === 0 ? (
            <div className="card p-6 text-sm text-[var(--text-dim)]">
              No monitoring sessions yet. Run the guided protocol above to start building a density trend.
            </div>
          ) : (
            <div className="card flex flex-col divide-y divide-[var(--border)]">
              {initialMonitoring.map((s, i) => {
                const density = s.sampleSize > 0 ? s.pestCount / s.sampleSize : 0;
                const prev = initialMonitoring[i + 1]; // sorted newest-first
                const prevDensity = prev && prev.sampleSize > 0 ? prev.pestCount / prev.sampleSize : null;
                return (
                  <div key={s.id} className="flex items-center justify-between px-4 py-3 text-sm">
                    <span>{new Date(s.date).toLocaleDateString()}</span>
                    <span className="flex items-center gap-2">
                      {density.toFixed(2)} density
                      {prevDensity != null && (
                        <span className={density > prevDensity ? "text-red-400" : density < prevDensity ? "text-[var(--accent)]" : "text-[var(--text-dim)]"}>
                          {density > prevDensity ? "▲" : density < prevDensity ? "▼" : "→"}
                        </span>
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {tab === "notes" && (
        <div className="flex flex-col gap-2">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={6}
            className="rounded-md border border-[var(--border)] bg-transparent px-3 py-2 text-sm"
          />
          <button
            onClick={saveNotes}
            disabled={savingNotes}
            className="self-start rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-[#0B1626] disabled:opacity-50"
          >
            {savingNotes ? "Saving…" : "Save notes"}
          </button>
        </div>
      )}
    </div>
  );
}
