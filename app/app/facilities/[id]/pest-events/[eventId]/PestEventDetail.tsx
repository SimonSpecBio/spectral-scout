"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { initialsFor } from "@/lib/avatar";
import { SEVERITY_COLOR, type Severity } from "@/lib/colors";
import { scaledPoints } from "@/lib/density";
import { queuedFetch, queuedFileFetch } from "@/lib/offline-queue";
import { markEngaged } from "@/lib/pwa-engagement";
import type { FollowUpSuggestion } from "@/lib/recommendations";
import { metricLabel, type MetricKind, type SpeciesThresholds } from "@/lib/scout-metric";
import { findAgent, findPestProgram, findProduct } from "@/lib/treatments-catalog";
import RecommendationsPanel from "./RecommendationsPanel";

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

interface Comment {
  id: string;
  body: string;
  createdAt: string;
  authorUserId: string | null;
  authorName: string | null;
  authorEmail: string | null;
}

interface MonitoringSession {
  id: string;
  date: string;
  metricKind: MetricKind;
  value: number;
}

interface Event {
  id: string;
  kind: "pest" | "pathogen";
  pestSpecies: string;
  scientificName: string | null;
  severity: Severity;
  status: "active" | "resolved";
  createdAt: string;
  resolvedAt: string | null;
  autoResolved: boolean;
  // Null for events created before this was tracked, or a since-deleted
  // account -- there's no way to know who logged those after the fact.
  loggedBy: string | null;
}

const TABS = ["timeline", "recommended", "treatments", "photos", "monitoring", "comments"] as const;
type Tab = (typeof TABS)[number];

export default function PestEventDetail({
  facilityId,
  event,
  locationLabel,
  mapHref,
  facilityAreaId,
  initialTreatments,
  initialPhotos,
  initialMonitoring,
  initialComments,
  currentUserId,
  inventoryItems,
  thresholds,
  followUpSuggestions,
  initialTab,
  isHomeGrower,
  orgState,
  isPilotTier,
}: {
  facilityId: string;
  event: Event;
  locationLabel: string;
  mapHref: string | null;
  facilityAreaId: string | null;
  initialTreatments: Treatment[];
  initialPhotos: Photo[];
  initialMonitoring: MonitoringSession[];
  initialComments: Comment[];
  currentUserId: string;
  inventoryItems: { id: string; name: string; unit: string; quantity: number; reorderLevel: number | null; unitCost: number | null }[];
  thresholds: SpeciesThresholds;
  followUpSuggestions: FollowUpSuggestion[];
  initialTab?: string;
  isHomeGrower: boolean;
  orgState: string | null;
  // "Ask a person" (ticket 96) is pilot-tier only -- lib/consent.ts's
  // free-tier promise means staff never see a general-tier event, so the
  // button itself is hidden rather than shown-then-rejected.
  isPilotTier: boolean;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>(initialTab && (TABS as readonly string[]).includes(initialTab) ? (initialTab as Tab) : "timeline");
  const [status, setStatus] = useState(event.status);
  const [shareLink, setShareLink] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [escalation, setEscalation] = useState<{ note: string | null; createdAt: string; resolvedAt: string | null; staffResponse: string | null } | null>(null);
  const [showEscalateConfirm, setShowEscalateConfirm] = useState(false);
  const [escalateNote, setEscalateNote] = useState("");
  const [escalating, setEscalating] = useState(false);
  const [escalateError, setEscalateError] = useState<string | null>(null);
  const [treatmentsList, setTreatmentsList] = useState(initialTreatments);
  const [photos, setPhotos] = useState(initialPhotos);
  const [photoQueued, setPhotoQueued] = useState(false);
  const [comments, setComments] = useState(initialComments);
  const [newComment, setNewComment] = useState("");
  const [postingComment, setPostingComment] = useState(false);
  const [commentQueued, setCommentQueued] = useState(false);
  const [statusQueued, setStatusQueued] = useState(false);
  const [escalationQueued, setEscalationQueued] = useState(false);

  const [treatmentType, setTreatmentType] = useState<TreatmentType>("biological");
  const [inventoryItemId, setInventoryItemId] = useState("");
  const [product, setProduct] = useState("");
  const [quantityUsed, setQuantityUsed] = useState<number | "">("");
  const [minutesSpent, setMinutesSpent] = useState<number | "">("");
  const [treatmentNotes, setTreatmentNotes] = useState("");
  const [submittingTreatment, setSubmittingTreatment] = useState(false);
  const [treatmentQueued, setTreatmentQueued] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [quickLogging, setQuickLogging] = useState(false);
  const [quickLogged, setQuickLogged] = useState(false);
  const [acceptingSuggestion, setAcceptingSuggestion] = useState<string | null>(null);
  const [acceptedSuggestions, setAcceptedSuggestions] = useState<Set<string>>(new Set());
  const selectedItem = inventoryItems.find((i) => i.id === inventoryItemId);

  const base = `/api/facilities/${facilityId}/pest-events/${event.id}`;

  // "Prefills the product from the last-used product or a recommendation"
  // -- repeats whatever was applied most recently to this event if
  // anything has been, otherwise falls back to the pest program's top
  // biocontrol pick (or top biopesticide if there's no biocontrol option),
  // same catalog RecommendationsPanel reads from. null when there's
  // nothing to prefill (brand-new species with no program and no prior
  // treatments) -- the button just doesn't render rather than guessing.
  const lastTreatment = treatmentsList[0];
  let quickLog: { type: TreatmentType; product: string } | null = null;
  if (lastTreatment?.product) {
    quickLog = { type: lastTreatment.type, product: lastTreatment.product };
  } else {
    const program = findPestProgram(event.pestSpecies);
    const agent = program?.primaryBiocontrol[0] ? findAgent(program.primaryBiocontrol[0]) : undefined;
    const prod = !agent && program?.biopesticideRotation[0] ? findProduct(program.biopesticideRotation[0]) : undefined;
    if (agent) quickLog = { type: "biological", product: agent.name };
    else if (prod) quickLog = { type: "pesticide", product: prod.name };
  }

  async function handleQuickLog() {
    if (!quickLog) return;
    setQuickLogging(true);
    setQuickLogged(false);
    const matchedItem = inventoryItems.find((i) => i.name.toLowerCase() === quickLog!.product.toLowerCase());
    const result = await queuedFetch(
      `${base}/treatments`,
      {
        type: quickLog.type,
        inventoryItemId: matchedItem?.id ?? null,
        product: quickLog.product,
        notes: "Quick log",
      },
      "Treatment"
    );
    if (result.ok) {
      markEngaged();
      setQuickLogged(true);
      if (!result.queued && result.data) {
        setTreatmentsList((prev) => [result.data as Treatment, ...prev]);
        router.refresh();
      }
    }
    setQuickLogging(false);
  }

  // "Nothing is auto-created without the grower accepting" -- these tasks
  // only ever get created from this explicit tap, never automatically
  // alongside the auto-resolve itself. Area-scoped (facilityAreaId, no
  // pestEventId) since they're about keeping the area clean going
  // forward, not the now-closed incident.
  async function acceptSuggestion(s: FollowUpSuggestion) {
    setAcceptingSuggestion(s.id);
    const dueAt = new Date(Date.now() + s.task.dueInDays * 86_400_000).toISOString();
    const res = await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: s.task.title,
        type: s.task.type,
        facilityId,
        facilityAreaId,
        dueAt,
        repeatEveryDays: s.task.repeatEveryDays,
      }),
    });
    if (res.ok) {
      markEngaged();
      setAcceptedSuggestions((prev) => new Set(prev).add(s.id));
    }
    setAcceptingSuggestion(null);
  }

  async function toggleStatus() {
    const next = status === "active" ? "resolved" : "active";
    const result = await queuedFetch(base, { status: next }, "Status", "PATCH");
    if (result.ok) {
      setStatus(next);
      if (result.queued) setStatusQueued(true);
      else router.refresh();
    }
  }

  async function createShareLink() {
    setSharing(true);
    setShareError(null);
    try {
      const res = await fetch(`${base}/share-links`, { method: "POST" });
      if (res.ok) {
        const row = await res.json();
        setShareLink(`${window.location.origin}/share/${row.token}`);
        setCopied(false);
      } else {
        setShareError("Couldn't create a share link. Check your connection and try again.");
      }
    } catch {
      setShareError("Couldn't create a share link. Check your connection and try again.");
    }
    setSharing(false);
  }

  async function revokeShareLinks() {
    await fetch(`${base}/share-links`, { method: "DELETE" });
    setShareLink(null);
  }

  useEffect(() => {
    if (!isPilotTier) return;
    fetch(`${base}/escalate`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setEscalation(data?.escalation ?? null))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPilotTier]);

  async function submitEscalation() {
    setEscalating(true);
    setEscalateError(null);
    const result = await queuedFetch(`${base}/escalate`, { note: escalateNote.trim() || null }, "Escalation");
    if (result.ok) {
      setShowEscalateConfirm(false);
      setEscalateNote("");
      if (result.queued) setEscalationQueued(true);
      else if (result.data) setEscalation(result.data as typeof escalation);
    } else {
      setEscalateError("Couldn't send this to our team. Check your connection and try again.");
    }
    setEscalating(false);
  }

  async function copyShareLink() {
    if (!shareLink) return;
    try {
      await navigator.clipboard.writeText(shareLink);
      setCopied(true);
    } catch {
      /* clipboard unavailable -- the link is still shown for manual copy */
    }
  }

  async function postComment(e: React.FormEvent) {
    e.preventDefault();
    const body = newComment.trim();
    if (!body) return;
    setPostingComment(true);
    const result = await queuedFetch(`${base}/comments`, { body }, "Comment");
    if (result.ok) {
      if (result.queued) setCommentQueued(true);
      else if (result.data) setComments((prev) => [...prev, result.data as Comment]);
      setNewComment("");
    }
    setPostingComment(false);
  }

  async function applyTreatment(e: React.FormEvent) {
    e.preventDefault();
    setSubmittingTreatment(true);
    setTreatmentQueued(false);
    const result = await queuedFetch(
      `${base}/treatments`,
      {
        type: treatmentType,
        inventoryItemId: inventoryItemId || null,
        product: selectedItem?.name ?? product,
        quantityUsed: quantityUsed === "" ? null : quantityUsed,
        minutesSpent: minutesSpent === "" ? null : minutesSpent,
        notes: treatmentNotes,
      },
      "Treatment"
    );
    if (result.ok) {
      markEngaged();
      // Queued offline: the server hasn't created the row yet, so there's
      // nothing real to prepend to the list -- it'll show up once the
      // queue syncs and this page is next loaded. Show a brief confirmation
      // instead of a fake optimistic row.
      if (result.queued) {
        setTreatmentQueued(true);
      } else if (result.data) {
        setTreatmentsList((prev) => [result.data as Treatment, ...prev]);
        router.refresh();
      }
      setInventoryItemId("");
      setProduct("");
      setQuantityUsed("");
      setMinutesSpent("");
      setTreatmentNotes("");
    }
    setSubmittingTreatment(false);
  }

  async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const result = await queuedFileFetch(`${base}/photos`, file, "file", "Photo");
    if (result.ok) {
      if (result.queued) setPhotoQueued(true);
      else if (result.data) setPhotos((prev) => [...prev, result.data as Photo]);
    }
    setUploading(false);
  }

  const timeline = [
    { label: event.loggedBy ? `Detected by ${event.loggedBy}` : "Detected", at: event.createdAt },
    ...treatmentsList.map((t) => ({ label: `${t.type.replace("_", " ")} applied${t.product ? ` -- ${t.product}` : ""}`, at: t.appliedAt })),
    ...(event.resolvedAt ? [{ label: "Resolved", at: event.resolvedAt }] : []),
  ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  // initialMonitoring arrives newest-first (matches the Monitoring tab's
  // list order); the graph needs oldest-first for a left-to-right timeline.
  // Event-scoped monitoring can mix methods session to session (the "+"
  // capture screen offers both Counts and Plant sampling every time), and
  // occupancy % / density pests-per-leaf aren't the same scale -- charting
  // both on one line would be meaningless. Keep only the run of sessions
  // that share the LATEST session's metric kind, same "skip rather than
  // mix scales" rule computeEscalationAlerts applies.
  const chronologicalAll = [...initialMonitoring].reverse();
  const chartMetricKind: MetricKind | null = chronologicalAll.length > 0 ? chronologicalAll[chronologicalAll.length - 1].metricKind : null;
  const chronological = chartMetricKind ? chronologicalAll.filter((s) => s.metricKind === chartMetricKind) : [];
  const densities = chronological.map((s) => s.value);
  const chartThreshold = chartMetricKind === "density" ? thresholds.density : thresholds.pct;
  const latestDensity = densities[densities.length - 1];
  const baselineDensity = densities[0];
  const changeVsBaseline =
    densities.length >= 2 && baselineDensity > 0 ? Math.round(((baselineDensity - latestDensity) / baselineDensity) * 100) : null;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-y-2">
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
            <div className="text-xs text-[var(--text-faint)]">
              Detected {new Date(event.createdAt).toLocaleDateString()}
              {event.loggedBy && <> by {event.loggedBy}</>}
            </div>
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
          <button onClick={createShareLink} disabled={sharing} className="rounded-md border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--text-dim)] disabled:opacity-50">
            {sharing ? "…" : "Share"}
          </button>
          {isPilotTier && !escalation && (
            <button
              onClick={() => setShowEscalateConfirm(true)}
              className="rounded-md border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--text-dim)]"
            >
              Ask a person
            </button>
          )}
        </div>
      </div>

      {statusQueued && <div className="text-xs text-[var(--text-dim)]">Status change saved offline. Will sync.</div>}

      {showEscalateConfirm && (
        <div className="card flex flex-col gap-3 p-3.5">
          <div className="text-sm">
            This shares this event -- species, severity, photos, and notes -- with Spectral&rsquo;s team for review. They&rsquo;ll follow up here once
            they&rsquo;ve looked at it.
          </div>
          <textarea
            value={escalateNote}
            onChange={(e) => setEscalateNote(e.target.value)}
            placeholder="What would you like a person to weigh in on? (optional)"
            rows={2}
            className="rounded-md border border-[var(--border)] bg-transparent px-3 py-2 text-sm"
          />
          <div className="flex gap-2">
            <button
              onClick={submitEscalation}
              disabled={escalating}
              className="rounded-md border border-[var(--accent)] px-3 py-1.5 text-sm text-[var(--accent)] disabled:opacity-50"
            >
              {escalating ? "Sending…" : "Send to Spectral"}
            </button>
            <button onClick={() => setShowEscalateConfirm(false)} className="rounded-md border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--text-dim)]">
              Cancel
            </button>
          </div>
        </div>
      )}

      {escalateError && (
        <div className="flex items-center justify-between gap-3 rounded-md p-3.5 text-sm" style={{ background: "var(--danger-bg)", color: "var(--danger)" }}>
          {escalateError}
          <button type="button" onClick={() => setEscalateError(null)} className="shrink-0 text-[var(--text-dim)]">
            Dismiss
          </button>
        </div>
      )}

      {escalation && (
        <div className="card flex flex-col gap-1 p-3.5">
          <div className="label-mono">{escalation.resolvedAt ? "Reviewed by Spectral" : "Flagged for review -- Spectral will follow up here"}</div>
          {escalation.staffResponse && <div className="text-sm">{escalation.staffResponse}</div>}
        </div>
      )}

      {escalationQueued && !escalation && (
        <div className="card flex flex-col gap-1 p-3.5">
          <div className="label-mono">Saved offline. Will send to Spectral once you're back online.</div>
        </div>
      )}

      {shareError && (
        <div
          className="flex items-center justify-between gap-3 rounded-md p-3.5 text-sm"
          style={{ background: "var(--danger-bg)", color: "var(--danger)" }}
        >
          {shareError}
          <button type="button" onClick={() => setShareError(null)} className="shrink-0 text-[var(--text-dim)]">
            Dismiss
          </button>
        </div>
      )}

      {shareLink && (
        <div className="card flex flex-col gap-2 p-3.5">
          <div className="label-mono">Read-only link -- expires in 30 days</div>
          <div className="flex items-center gap-2">
            <input readOnly value={shareLink} className="flex-1 rounded-md border border-[var(--border)] bg-transparent px-2 py-1.5 text-xs" />
            <button onClick={copyShareLink} className="shrink-0 rounded-md border border-[var(--border)] px-2.5 py-1.5 text-xs text-[var(--text-dim)]">
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <button onClick={revokeShareLinks} className="self-start text-xs text-[var(--danger)]">
            Revoke access
          </button>
        </div>
      )}

      {status === "active" && quickLog && (
        <button
          onClick={handleQuickLog}
          disabled={quickLogging}
          className="card flex items-center justify-between p-4 text-left disabled:opacity-60"
        >
          <div>
            <div className="label-mono">{lastTreatment?.product ? "Quick log — repeat last" : "Quick log — recommended"}</div>
            <div className="text-sm">{quickLog.product}</div>
          </div>
          <span className="shrink-0 rounded-md bg-[var(--accent)] px-3 py-1.5 text-xs font-medium text-[var(--on-accent)]">
            {quickLogging ? "Logging…" : quickLogged ? "Logged ✓" : "Log"}
          </span>
        </button>
      )}

      {status === "resolved" && event.autoResolved && (
        <div className="card flex items-center gap-3 p-4" style={{ background: "var(--success-bg)", border: "0.5px solid var(--success-border)" }}>
          <span style={{ color: "var(--success)" }}>✓</span>
          <div className="flex-1 text-sm">
            Auto-resolved — the last two monitoring sessions came back under threshold, no infestation left to track.
          </div>
          <button onClick={toggleStatus} className="shrink-0 text-xs text-[var(--text-dim)] underline">
            Not resolved? Reopen
          </button>
        </div>
      )}

      {status === "resolved" && event.autoResolved && followUpSuggestions.length > 0 && (
        <div className="card flex flex-col divide-y divide-[var(--border)] p-4">
          <div className="pb-2 label-mono">Keep it from coming back</div>
          {followUpSuggestions.map((s) => {
            const accepted = acceptedSuggestions.has(s.id);
            return (
              <div key={s.id} className="flex items-center justify-between gap-3 py-3">
                <div>
                  <div className="text-sm">{s.label}</div>
                  <div className="label-mono">{s.sub}</div>
                </div>
                <button
                  onClick={() => acceptSuggestion(s)}
                  disabled={accepted || acceptingSuggestion === s.id}
                  className={`shrink-0 rounded-md px-3 py-1.5 text-xs font-medium disabled:opacity-70 ${
                    accepted ? "text-[var(--success)]" : "bg-[var(--accent)] text-[var(--on-accent)]"
                  }`}
                >
                  {accepted ? "Scheduled ✓" : acceptingSuggestion === s.id ? "Scheduling…" : "Accept"}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {densities.length > 0 && chartMetricKind && (
        <div className="card flex flex-col items-start gap-4 overflow-x-auto p-4 sm:flex-row sm:items-center sm:gap-6">
          <svg width={220} height={52} className="shrink-0">
            {(() => {
              const scaled = scaledPoints(densities, chartThreshold, 220, 52);
              return (
                <>
                  <line
                    x1={0}
                    y1={scaled.refY}
                    x2={220}
                    y2={scaled.refY}
                    stroke="var(--text-faint)"
                    strokeWidth={1}
                    strokeDasharray="3 3"
                  />
                  <text x={2} y={scaled.refY - 3} className="font-mono" fontSize={8} fill="var(--text-faint)">
                    {chartMetricKind === "density" ? `${chartThreshold}/leaf threshold` : `${chartThreshold}% threshold`}
                  </text>
                  <polyline points={scaled.points} fill="none" stroke="var(--danger)" strokeWidth={2} />
                </>
              );
            })()}
          </svg>
          <div className="flex flex-wrap gap-6">
            <div>
              <div className="text-2xl font-semibold">
                {chartMetricKind === "density" ? latestDensity.toFixed(1) : `${Math.round(latestDensity)}%`}
              </div>
              <div className="text-xs text-[var(--text-dim)]">{chartMetricKind === "density" ? "latest pests/leaf" : "latest infested"}</div>
            </div>
            {changeVsBaseline != null && (
              <div>
                <div className={`text-2xl font-semibold ${changeVsBaseline >= 0 ? "text-[var(--success)]" : "text-[var(--danger)]"}`}>
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


      <div className="flex gap-4 overflow-x-auto border-b border-[var(--border)]">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`shrink-0 border-b-2 px-1 pb-2 text-sm capitalize ${
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

      {tab === "recommended" && (
        <RecommendationsPanel
          facilityId={facilityId}
          eventId={event.id}
          pestSpecies={event.pestSpecies}
          inventory={inventoryItems.map((i) => ({ name: i.name, quantity: i.quantity, reorderLevel: i.reorderLevel ?? null, unit: i.unit, unitCost: i.unitCost }))}
          isHomeGrower={isHomeGrower}
          orgState={orgState}
        />
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
            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={submittingTreatment}
                className="self-start rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-[var(--on-accent)] disabled:opacity-50"
              >
                {submittingTreatment ? "Saving…" : "Save"}
              </button>
              {treatmentQueued && <span className="text-xs text-[var(--text-dim)]">Saved offline — will sync</span>}
            </div>
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
          {photoQueued && <div className="text-xs text-[var(--text-dim)]">Photo saved offline. Will upload once you're back online.</div>}
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
            className="w-fit rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-[var(--on-accent)]"
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
                const prev = initialMonitoring[i + 1]; // sorted newest-first
                // Only compare trend against the immediately-previous
                // session when it used the same metric -- an occupancy %
                // and a density pests/leaf reading aren't on the same
                // scale, so a method switch between two sessions shows no
                // arrow rather than a meaningless comparison.
                const prevValue = prev && prev.metricKind === s.metricKind ? prev.value : null;
                return (
                  <div key={s.id} className="flex items-center justify-between px-4 py-3 text-sm">
                    <span>{new Date(s.date).toLocaleDateString()}</span>
                    <span className="flex items-center gap-2">
                      {metricLabel({ kind: s.metricKind, value: s.value })}
                      {prevValue != null && (
                        <span className={s.value > prevValue ? "text-[var(--danger)]" : s.value < prevValue ? "text-[var(--success)]" : "text-[var(--text-dim)]"}>
                          {s.value > prevValue ? "▲" : s.value < prevValue ? "▼" : "→"}
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

      {tab === "comments" && (
        <div className="flex flex-col gap-4">
          {comments.length === 0 ? (
            <div className="card p-4 text-sm text-[var(--text-dim)]">No comments yet -- add one below.</div>
          ) : (
            <div className="flex flex-col gap-3">
              {comments.map((c) => (
                <div key={c.id} className="flex items-start gap-2.5">
                  <span
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs"
                    style={{ background: "var(--chip-bg)", color: "var(--text-dim)" }}
                  >
                    {c.authorUserId ? initialsFor(c.authorName, c.authorEmail ?? "") : "—"}
                  </span>
                  <div className="flex flex-col gap-0.5">
                    <div className="flex items-center gap-2 text-xs text-[var(--text-dim)]">
                      <span className="font-medium text-[var(--text)]">
                        {c.authorUserId ? (c.authorUserId === currentUserId ? "You" : (c.authorName ?? c.authorEmail ?? "Someone")) : "Migrated note"}
                      </span>
                      <span>{new Date(c.createdAt).toLocaleString()}</span>
                    </div>
                    <div className="text-sm">{c.body}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
          <form onSubmit={postComment} className="flex gap-2">
            <input
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              placeholder="Add a comment…"
              className="flex-1 rounded-md border border-[var(--border)] bg-transparent px-3 py-2 text-sm"
            />
            <button
              type="submit"
              disabled={postingComment || !newComment.trim()}
              className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-[var(--on-accent)] disabled:opacity-50"
            >
              {postingComment ? "Posting…" : "Post"}
            </button>
          </form>
          {commentQueued && <div className="text-xs text-[var(--text-dim)]">Comment saved offline. Will post once you're back online.</div>}
        </div>
      )}
    </div>
  );
}
