"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { initialsFor } from "@/lib/avatar";
import { SEVERITY_COLOR, type Severity } from "@/lib/colors";
import { queuedFetch, queuedFileFetch } from "@/lib/offline-queue";
import { markEngaged } from "@/lib/pwa-engagement";
import type { FollowUpSuggestion } from "@/lib/recommendations";
import { metricLabel, type MetricKind, type SpeciesThresholds } from "@/lib/scout-metric";
import { buildSpectralLightProtocol } from "@/lib/spectral-light";
import { thresholdSourceFor } from "@/lib/threshold-sources";
import {
  displayNameForPestSpecies,
  displayNameForTreatmentType,
  findAgent,
  findPestProgram,
  findProduct,
  findProductByName,
} from "@/lib/treatments-catalog";
import LocalDate from "@/app/app/LocalDate";
import TimePicker from "@/app/app/TimePicker";
import EventChart from "./EventChart";
import RecommendationsPanel from "./RecommendationsPanel";

type TreatmentType = "pesticide" | "biological" | "spectral_light";

// A one- or two-point line isn't a real trend, just noise presented as one
// (reviewer finding, ticket recqSM600NM2KJHjh) -- the chart stays hidden
// below this and shows the plain latest reading instead.
const MIN_SESSIONS_FOR_CHART = 3;

// Hidden per Simon (2026-09-01) after seeing them live on the chart --
// code/computation kept intact rather than deleted, in case these come
// back in a different form later. Flip to true to re-enable.
const SHOW_SESSIONS_LOGGED_STAT = false;
const SHOW_MORE_SESSIONS_HINT = false;
const SHOW_THRESHOLD_CONFIDENCE = false;

interface Treatment {
  id: string;
  type: TreatmentType;
  product: string | null;
  targetPest: string | null;
  notes: string | null;
  appliedAt: string;
  // Null for treatments logged before operatorUserId existed, or a
  // since-deleted account -- the chart's treatment-marker tooltip just
  // omits it rather than showing a broken name (ticket B4).
  loggedBy: string | null;
}

interface Photo {
  id: string;
  blobUrl: string;
  caption: string | null;
  uploadedAt: string;
  // Null for photos uploaded before this was tracked, or a since-deleted
  // account -- the tap-to-reveal overlay shows "Unknown" for those rather
  // than a broken name (ticket B6/B7).
  uploadedByName: string | null;
  uploadedByUserId: string | null;
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
  assessmentType: "pest_count" | "disease_severity";
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
  showThresholdConfidence,
  followUpSuggestions,
  initialTab,
  isHomeGrower,
  orgState,
  isPilotTier,
  shareableMembers,
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
  // False once the org has its own override for this species -- unused
  // while SHOW_THRESHOLD_CONFIDENCE is false, kept so the confidence
  // badge's org-override gating still works correctly if re-enabled.
  showThresholdConfidence: boolean;
  followUpSuggestions: FollowUpSuggestion[];
  initialTab?: string;
  isHomeGrower: boolean;
  orgState: string | null;
  // "Ask a person" (ticket 96) is pilot-tier only -- lib/consent.ts's
  // free-tier promise means staff never see a general-tier event, so the
  // button itself is hidden rather than shown-then-rejected.
  isPilotTier: boolean;
  // Team-only sharing (ticket B5) replaces the old external read-only
  // link -- excludes the current user (server-computed in page.tsx).
  shareableMembers: { userId: string; name: string | null; email: string }[];
}) {
  const router = useRouter();
  const [status, setStatus] = useState(event.status);
  const [showSharePicker, setShowSharePicker] = useState(false);
  const [selectedShareUserIds, setSelectedShareUserIds] = useState<Set<string>>(new Set());
  const [sharing, setSharing] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);
  const [shareConfirmation, setShareConfirmation] = useState<string | null>(null);
  const [escalation, setEscalation] = useState<{ note: string | null; createdAt: string; resolvedAt: string | null; staffResponse: string | null } | null>(null);
  const [showEscalateConfirm, setShowEscalateConfirm] = useState(false);
  const [escalateNote, setEscalateNote] = useState("");
  const [escalating, setEscalating] = useState(false);
  const [escalateError, setEscalateError] = useState<string | null>(null);
  const [treatmentsList, setTreatmentsList] = useState(initialTreatments);
  const [photos, setPhotos] = useState(initialPhotos);
  const [selectedPhotoId, setSelectedPhotoId] = useState<string | null>(null);
  const [photoQueued, setPhotoQueued] = useState(false);
  const [comments, setComments] = useState(initialComments);
  const [newComment, setNewComment] = useState("");
  const [postingComment, setPostingComment] = useState(false);
  const [commentQueued, setCommentQueued] = useState(false);
  const [statusQueued, setStatusQueued] = useState(false);
  const [escalationQueued, setEscalationQueued] = useState(false);
  // Resolving with zero context (why -- treatment worked? about to harvest?)
  // left the timeline unable to say anything more than "resolved" (ticket
  // found in QA, 2026-09-03). Same "optional textarea before confirming"
  // pattern as the escalate-to-Spectral flow above. Only resolving prompts
  // for this -- reopening is a correction, not a decision that needs
  // explaining.
  const [showResolveConfirm, setShowResolveConfirm] = useState(false);
  const [resolveNote, setResolveNote] = useState("");
  const [resolving, setResolving] = useState(false);

  const [treatmentType, setTreatmentType] = useState<TreatmentType>("biological");
  const [inventoryItemId, setInventoryItemId] = useState("");
  const [product, setProduct] = useState("");
  // Auto-filled from the matched catalog product's sourced label rate,
  // but only while untouched -- same rule as NewTreatmentForm's identical
  // field (Airtable ticket B3, splitting the old "Rate, area, notes..."
  // catch-all into this field plus the Notes input below).
  const [dosage, setDosage] = useState("");
  const [dosageTouched, setDosageTouched] = useState(false);
  const [quantityUsed, setQuantityUsed] = useState<number | "">("");
  // Plain number, not number|"" -- TimePicker always has a real value (it
  // starts at 0, same as NewTreatmentForm's identical fields), there's no
  // "empty" state to represent once it's a wheel instead of a text input.
  const [minutesSpent, setMinutesSpent] = useState(0);
  const [fixtureId, setFixtureId] = useState("");
  const [minutesAfterDark, setMinutesAfterDark] = useState(0);
  const [durationMin, setDurationMin] = useState(0);
  // Replaces the old bare "pulse count" number, which had nowhere to
  // record a second pulse's OWN timing (Airtable ticket C3).
  const [hasSecondPulse, setHasSecondPulse] = useState(false);
  const [secondPulseOffsetMinutes, setSecondPulseOffsetMinutes] = useState(0);
  const [secondPulseDurationMinutes, setSecondPulseDurationMinutes] = useState(0);
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
  const spectralProgram = findPestProgram(event.pestSpecies);
  const spectralProtocol = spectralProgram
    ? buildSpectralLightProtocol(spectralProgram)
    : { applicability: "not_indicated" as const, summary: "", schedule: "" };

  // Subtle trust signal, not a citation -- confidence only (Simon, 2026-09-01:
  // "don't surface citation... confidence, but I want it to be subtle").
  // Hidden via SHOW_THRESHOLD_CONFIDENCE after Simon saw it live, but this
  // computation stays intact for re-enabling later.
  const thresholdSource = showThresholdConfidence ? thresholdSourceFor(event.pestSpecies) : null;
  const thresholdConfidenceLabel =
    thresholdSource && thresholdSource.confidence !== "n/a" ? thresholdSource.confidence : null;

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

  async function confirmResolve() {
    setResolving(true);
    const note = resolveNote.trim();
    // Comment first, status second -- if the comment post fails partway
    // (queued offline, say) the event still shouldn't silently resolve with
    // the note lost; posting it first means a failure here stops before
    // anything changes.
    if (note) {
      const commentResult = await queuedFetch(`${base}/comments`, { body: note }, "Comment");
      if (commentResult.ok) {
        if (commentResult.queued) setCommentQueued(true);
        else if (commentResult.data) setComments((prev) => [...prev, commentResult.data as Comment]);
      }
    }
    await toggleStatus();
    setShowResolveConfirm(false);
    setResolveNote("");
    setResolving(false);
  }

  function toggleShareUser(userId: string) {
    setSelectedShareUserIds((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }

  // Team-only sharing (ticket B5) -- notifies each picked teammate instead
  // of generating an external read-only link.
  async function submitShare() {
    if (selectedShareUserIds.size === 0) return;
    setSharing(true);
    setShareError(null);
    try {
      const res = await fetch(`${base}/share`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toUserIds: [...selectedShareUserIds] }),
      });
      if (res.ok) {
        const count = selectedShareUserIds.size;
        setShareConfirmation(`Shared with ${count} teammate${count === 1 ? "" : "s"}`);
        setSelectedShareUserIds(new Set());
        setShowSharePicker(false);
      } else {
        setShareError("Couldn't share this event. Check your connection and try again.");
      }
    } catch {
      setShareError("Couldn't share this event. Check your connection and try again.");
    }
    setSharing(false);
  }

  // The page used to be a tab bar (initialTab picked the starting tab, for
  // deep links like the dashboard's "?tab=recommended"); now every section
  // renders at once in one scroll, so initialTab instead scrolls that
  // section into view on load. Ids below match the query values those
  // links already send (lib/notifications.ts, app/api/search/route.ts,
  // app/app/page.tsx) -- no caller needed to change.
  useEffect(() => {
    if (!initialTab) return;
    document.getElementById(initialTab)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [initialTab]);

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
        dosage: treatmentType === "pesticide" && dosage ? dosage : null,
        quantityUsed: quantityUsed === "" ? null : quantityUsed,
        minutesSpent: minutesSpent || null,
        fixtureId: fixtureId || null,
        minutesAfterDark: minutesAfterDark || null,
        durationMin: durationMin || null,
        secondPulseOffsetMinutes: hasSecondPulse ? secondPulseOffsetMinutes : null,
        secondPulseDurationMinutes: hasSecondPulse ? secondPulseDurationMinutes : null,
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
      setDosage("");
      setDosageTouched(false);
      setQuantityUsed("");
      setMinutesSpent(0);
      setFixtureId("");
      setMinutesAfterDark(0);
      setDurationMin(0);
      setHasSecondPulse(false);
      setSecondPulseOffsetMinutes(0);
      setSecondPulseDurationMinutes(0);
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
      else if (result.data) {
        // The raw insert response has no uploader-name join -- "You" is
        // accurate here (this upload really was the current viewer), same
        // convention the Comments list already uses for own-authored rows.
        // router.refresh() reconciles with the server-joined name after.
        const raw = result.data as { id: string; blobUrl: string; caption: string | null; uploadedAt: string };
        setPhotos((prev) => [
          ...prev,
          { id: raw.id, blobUrl: raw.blobUrl, caption: raw.caption, uploadedAt: raw.uploadedAt, uploadedByName: "You", uploadedByUserId: currentUserId },
        ]);
        router.refresh();
      }
    }
    setUploading(false);
  }

  const timeline = [
    { label: event.loggedBy ? `Detected by ${event.loggedBy}` : "Detected", at: event.createdAt },
    ...treatmentsList.map((t) => ({ label: `${displayNameForTreatmentType(t.type)} applied${t.product ? `: ${t.product}` : ""}`, at: t.appliedAt })),
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
  //
  // A pathogen event needs a stronger rule than "match the latest kind":
  // its real trend is always the disease_severity assessment (a leafGrid
  // occupancy %), so a single stray pest_count reading logged against it
  // (the generic "+New" monitoring flow doesn't force disease events into
  // the disease-specific form) was enough to either get excluded itself or,
  // worse, silently keep the whole event under MIN_SESSIONS_FOR_CHART
  // forever even with real disease history (found in QA, 2026-09-03: a
  // pathogen event with 3 real sessions -- 2 disease, 1 stray pest_count --
  // never showed a chart at all). Pathogen events only ever chart their own
  // disease_severity sessions; pest events keep the original behavior.
  const chronologicalAll = [...initialMonitoring].reverse();
  const relevantSessions =
    event.kind === "pathogen" ? chronologicalAll.filter((s) => s.assessmentType === "disease_severity") : chronologicalAll;
  const chartMetricKind: MetricKind | null = relevantSessions.length > 0 ? relevantSessions[relevantSessions.length - 1].metricKind : null;
  const chronological = chartMetricKind ? relevantSessions.filter((s) => s.metricKind === chartMetricKind) : [];
  const densities = chronological.map((s) => s.value);
  // 0 for a presence-triggered species -- draws the reference line at the
  // floor instead of a numeric threshold that isn't the real rule for
  // this species (lib/scout-metric.ts's isOverThreshold).
  const chartThreshold = thresholds.presenceTriggered ? 0 : chartMetricKind === "density" ? thresholds.density : thresholds.pct;
  const latestDensity = densities[densities.length - 1];
  const baselineDensity = densities[0];
  const changeVsBaseline =
    densities.length >= 2 && baselineDensity > 0 ? Math.round(((baselineDensity - latestDensity) / baselineDensity) * 100) : null;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-y-2">
        <div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-semibold capitalize">{displayNameForPestSpecies(event.pestSpecies)}</h1>
              {event.kind === "pathogen" && (
                <span className="label-mono rounded border border-[var(--border-soft)] px-1.5 py-0.5">Disease</span>
              )}
              <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: SEVERITY_COLOR[event.severity] }} />
            </div>
            {event.scientificName && <div className="text-sm italic text-[var(--text-dim)]">{event.scientificName}</div>}
            <div className="text-sm text-[var(--text-dim)]">{locationLabel}</div>
            <div className="text-xs text-[var(--text-faint)]">
              Detected <LocalDate date={event.createdAt} format={(d) => d.toLocaleDateString()} />
              {event.loggedBy && <> by {event.loggedBy}</>}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span
            className="rounded-md border px-3 py-1.5 text-sm"
            style={{ borderColor: SEVERITY_COLOR[event.severity], color: SEVERITY_COLOR[event.severity] }}
          >
            {/* "Severe severity" reads redundantly -- only append the word
                "severity" for the non-severe levels (ticket feedback,
                2026-09-03). */}
            <span className="capitalize">{event.severity}</span>
            {event.severity !== "severe" && " severity"}
          </span>
          {shareableMembers.length > 0 && (
            <button
              onClick={() => {
                setShowSharePicker((v) => !v);
                setShareConfirmation(null);
              }}
              className="rounded-md border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--text-dim)]"
            >
              Share
            </button>
          )}
          <button
            onClick={() => (status === "active" ? setShowResolveConfirm((v) => !v) : toggleStatus())}
            className={`rounded-md border px-3 py-1.5 text-sm ${
              status === "active" ? "border-[var(--accent)] text-[var(--accent)]" : "border-[var(--border)] text-[var(--text-dim)]"
            }`}
          >
            {status === "active" ? "Mark resolved" : "Reopen"}
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

      {showResolveConfirm && (
        <div className="card flex flex-col gap-3 p-3.5">
          <div className="text-sm">Mark this event resolved?</div>
          <textarea
            value={resolveNote}
            onChange={(e) => setResolveNote(e.target.value)}
            placeholder="Why? (optional -- e.g. treatment worked, about to harvest)"
            rows={2}
            className="rounded-md border border-[var(--border)] bg-transparent px-3 py-2 text-sm"
          />
          <div className="flex gap-2">
            <button
              onClick={confirmResolve}
              disabled={resolving}
              className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-sm font-medium text-[var(--on-accent)] disabled:opacity-50"
            >
              {resolving ? "Resolving…" : "Mark resolved"}
            </button>
            <button
              onClick={() => {
                setShowResolveConfirm(false);
                setResolveNote("");
              }}
              className="rounded-md border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--text-dim)]"
            >
              Cancel
            </button>
          </div>
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

      {showSharePicker && (
        <div className="card flex flex-col gap-3 p-3.5">
          <div className="label-mono">Share with teammates</div>
          <div className="flex flex-col gap-2">
            {shareableMembers.map((m) => (
              <label key={m.userId} className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={selectedShareUserIds.has(m.userId)} onChange={() => toggleShareUser(m.userId)} />
                {m.name ?? m.email}
              </label>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={submitShare}
              disabled={sharing || selectedShareUserIds.size === 0}
              className="self-start rounded-md bg-[var(--accent)] px-3 py-1.5 text-sm font-medium text-[var(--on-accent)] disabled:opacity-50"
            >
              {sharing ? "Sharing…" : "Share"}
            </button>
            <button onClick={() => setShowSharePicker(false)} className="text-sm text-[var(--text-dim)]">
              Cancel
            </button>
          </div>
        </div>
      )}

      {shareConfirmation && (
        <div className="card flex items-center justify-between gap-3 p-3.5 text-sm" style={{ color: "var(--success)" }}>
          {shareConfirmation}
          <button type="button" onClick={() => setShareConfirmation(null)} className="shrink-0 text-[var(--text-dim)]">
            Dismiss
          </button>
        </div>
      )}

      {densities.length >= MIN_SESSIONS_FOR_CHART && chartMetricKind ? (
        <div className="card flex flex-col gap-3 p-4">
          <div className="flex items-center justify-between">
            <span className="label-mono">Pest event history</span>
            <span className="text-xs text-[var(--text-dim)]">{chartMetricKind === "density" ? "Pests/leaf" : "% infested"}</span>
          </div>
          <EventChart
            chronological={chronological.map((s) => ({ id: s.id, date: s.date, value: s.value }))}
            metricKind={chartMetricKind}
            threshold={chartThreshold}
            presenceTriggered={thresholds.presenceTriggered}
            treatments={treatmentsList.map((t) => ({ id: t.id, type: t.type, product: t.product, loggedBy: t.loggedBy, appliedAt: t.appliedAt }))}
            detectedAt={event.createdAt}
          />
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
                <div className="text-xs text-[var(--text-dim)]">since detection</div>
              </div>
            )}
            {SHOW_SESSIONS_LOGGED_STAT && (
              <div>
                <div className="text-2xl font-semibold">{densities.length}</div>
                <div className="text-xs text-[var(--text-dim)]">sessions logged</div>
              </div>
            )}
          </div>
          {SHOW_THRESHOLD_CONFIDENCE && thresholdConfidenceLabel && (
            <div className="text-xs text-[var(--text-faint)]">Threshold confidence: {thresholdConfidenceLabel}</div>
          )}
        </div>
      ) : densities.length > 0 && chartMetricKind ? (
        // 1-2 sessions logged -- a line/graph off that few points isn't a
        // real trend, just noise presented as one (reviewer finding, ticket
        // recqSM600NM2KJHjh). Show the plain latest reading instead of
        // scaledPoints' misleading one/two-point line until there's enough
        // data for MIN_SESSIONS_FOR_CHART to actually mean something.
        <div className="card flex items-center justify-between gap-3 p-4">
          <div>
            <div className="text-2xl font-semibold">
              {chartMetricKind === "density" ? latestDensity.toFixed(1) : `${Math.round(latestDensity)}%`}
            </div>
            <div className="text-xs text-[var(--text-dim)]">
              {chartMetricKind === "density" ? "latest pests/leaf" : "latest infested"} ·{" "}
              <LocalDate
                date={chronological[chronological.length - 1].date}
                format={(d) => d.toLocaleDateString(undefined, { month: "short", day: "numeric" })}
              />
            </div>
          </div>
          {SHOW_MORE_SESSIONS_HINT && (
            <div className="text-xs text-[var(--text-faint)]">
              {MIN_SESSIONS_FOR_CHART - densities.length} more session{MIN_SESSIONS_FOR_CHART - densities.length === 1 ? "" : "s"} for a trend chart
            </div>
          )}
        </div>
      ) : (
        <div className="card flex items-center justify-between gap-3 p-4">
          <div className="text-sm text-[var(--text-dim)]">No monitoring data yet -- log a session to start tracking this over time.</div>
          <Link
            href={`/app/facilities/${facilityId}/pest-events/${event.id}/monitoring`}
            className="shrink-0 rounded-md bg-[var(--accent)] px-3 py-1.5 text-xs font-medium text-[var(--on-accent)]"
          >
            Start monitoring
          </Link>
        </div>
      )}

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

      {status === "active" && quickLog && (
        <button
          onClick={handleQuickLog}
          disabled={quickLogging}
          className="card flex items-center justify-between p-4 text-left disabled:opacity-60"
        >
          <div>
            <div className="label-mono">{lastTreatment?.product ? "Quick log: repeat last" : "Quick log: recommended"}</div>
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
            Auto-resolved. The last two monitoring sessions came back under threshold, no infestation left to track.
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

      <section id="timeline" className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Timeline</h2>
        <div className="card flex flex-col divide-y divide-[var(--border)]">
          {timeline.map((item, i) => (
            <div key={i} className="flex items-center justify-between px-4 py-3 text-sm capitalize">
              <span>{item.label}</span>
              <span className="text-[var(--text-dim)]">
                <LocalDate date={item.at} format={(d) => d.toLocaleDateString()} />
              </span>
            </div>
          ))}
          {mapHref && (
            <Link href={mapHref} className="px-4 py-3 text-sm text-[var(--accent)]">
              View on site map →
            </Link>
          )}
        </div>
      </section>

      <section id="recommended" className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Recommended protocols</h2>
        <RecommendationsPanel
          facilityId={facilityId}
          eventId={event.id}
          pestSpecies={event.pestSpecies}
          inventory={inventoryItems.map((i) => ({ name: i.name, quantity: i.quantity, reorderLevel: i.reorderLevel ?? null, unit: i.unit, unitCost: i.unitCost }))}
          isHomeGrower={isHomeGrower}
          orgState={orgState}
        />
      </section>

      <section id="treatments" className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Log treatment</h2>
        <div className="flex flex-col gap-4">
          <form onSubmit={applyTreatment} className="card flex flex-col gap-2 p-4">
            <div className="text-sm font-medium">Apply treatment</div>
            <div className="flex gap-2">
              {(["biological", "pesticide", "spectral_light"] as const).map((t) => (
                <button
                  type="button"
                  key={t}
                  onClick={() => setTreatmentType(t)}
                  className={`rounded-md border px-3 py-1.5 text-sm ${
                    treatmentType === t ? "border-[var(--accent)] text-[var(--accent)]" : "border-[var(--border)] text-[var(--text-dim)]"
                  }`}
                >
                  {displayNameForTreatmentType(t)}
                </button>
              ))}
            </div>
            {/* Spectral's hardware is never an Inventory line item (same
                reasoning as the recommendations panel's identical spectral
                check) -- this select showed for every treatment type
                including Spectral, offering a product picker for something
                that has no product (ticket found in QA, 2026-09-03). */}
            {inventoryItems.length > 0 && treatmentType !== "spectral_light" && (
              <select
                value={inventoryItemId}
                onChange={(e) => {
                  const id = e.target.value;
                  setInventoryItemId(id);
                  // Auto-fills the sourced label rate the moment a catalog
                  // match is picked, only while still untouched -- same
                  // rule as the freeform input below and NewTreatmentForm's
                  // identical field (Airtable ticket B3).
                  if (!dosageTouched) {
                    const matched = inventoryItems.find((i) => i.id === id);
                    const catalogProduct = matched ? findProductByName(matched.name) : undefined;
                    setDosage(catalogProduct?.typicalDosage ?? "");
                  }
                }}
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
                onChange={(e) => {
                  const name = e.target.value;
                  setProduct(name);
                  if (!dosageTouched) {
                    const catalogProduct = findProductByName(name);
                    if (catalogProduct?.typicalDosage) setDosage(catalogProduct.typicalDosage);
                  }
                }}
                placeholder="Product (e.g. Beauveria bassiana)"
                className="rounded-md border border-[var(--border)] bg-transparent px-3 py-2 text-sm"
              />
            )}
            {treatmentType === "pesticide" && (
              <input
                value={dosage}
                onChange={(e) => {
                  setDosageTouched(true);
                  setDosage(e.target.value);
                }}
                placeholder="Dosage (e.g. 1-2 oz/gal)"
                className="rounded-md border border-[var(--border)] bg-transparent px-3 py-2 text-sm"
              />
            )}
            {/* REI/PHI (lib/rei-phi.ts's computeRestrictions) only ever reads
                reiHours/phiDays off a LINKED inventory item -- a freeform
                pesticide name looks identical to a tracked one in this form
                but silently gets zero restriction tracking. Guessing at a
                fuzzy match to a catalog product's numbers here would be
                worse than no match at all (a wrong REI/PHI window is a
                safety problem, not just a missing feature), so this warns
                instead of inferring. Only once there's actually a typed
                name to warn about, and not when it happens to match a real
                inventory item by name (even if not picked from the
                dropdown) -- an empty field or a real match isn't a warning
                about anything. */}
            {treatmentType === "pesticide" &&
              !inventoryItemId &&
              product.trim().length > 0 &&
              !inventoryItems.some((i) => i.name.toLowerCase() === product.trim().toLowerCase()) && (
                <div className="rounded-md p-2.5 text-xs" style={{ background: "var(--danger-bg)", color: "var(--danger)" }}>
                  &ldquo;{product.trim()}&rdquo; isn&apos;t in your inventory list, so this application won&apos;t get re-entry/harvest (REI/PHI)
                  tracking. Add it to Inventory first if you want that tracked.
                </div>
              )}
            {treatmentType === "spectral_light" && (
              <>
                <label className="flex flex-col gap-1 text-sm text-[var(--text-dim)]">
                  Fixture ID (optional)
                  <input
                    value={fixtureId}
                    onChange={(e) => setFixtureId(e.target.value)}
                    placeholder="e.g. RL-890013"
                    className="rounded-md border border-[var(--border)] bg-transparent px-3 py-2 text-sm text-[var(--text)]"
                  />
                </label>
                <div className="flex flex-col gap-2">
                  <label className="flex items-center justify-between gap-2 text-sm text-[var(--text-dim)]">
                    Mins after dark
                    <TimePicker valueMinutes={minutesAfterDark} onChange={setMinutesAfterDark} />
                  </label>
                  <label className="flex items-center justify-between gap-2 text-sm text-[var(--text-dim)]">
                    Duration
                    <TimePicker valueMinutes={durationMin} onChange={setDurationMin} />
                  </label>
                  <label className="flex items-center gap-2 text-sm text-[var(--text-dim)]">
                    <input
                      type="checkbox"
                      checked={hasSecondPulse}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setHasSecondPulse(checked);
                        // Defaults the second pulse's duration to the
                        // first's the moment the toggle switches on -- not
                        // a fabricated number, just a starting point to
                        // edit (Airtable ticket C3's own spec).
                        if (checked && secondPulseDurationMinutes === 0) setSecondPulseDurationMinutes(durationMin);
                      }}
                    />
                    Multiple nightly treatments?
                  </label>
                  {hasSecondPulse && (
                    <>
                      <label className="flex items-center justify-between gap-2 text-sm text-[var(--text-dim)]">
                        Second treatment starts (after first)
                        <TimePicker valueMinutes={secondPulseOffsetMinutes} onChange={setSecondPulseOffsetMinutes} mode="minutesOnly" />
                      </label>
                      <label className="flex items-center justify-between gap-2 text-sm text-[var(--text-dim)]">
                        Second treatment duration
                        <TimePicker valueMinutes={secondPulseDurationMinutes} onChange={setSecondPulseDurationMinutes} mode="minutesOnly" />
                      </label>
                    </>
                  )}
                </div>
              </>
            )}
            <div className="flex gap-2">
              {inventoryItemId && (
                <input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="any"
                  value={quantityUsed}
                  onChange={(e) => setQuantityUsed(e.target.value === "" ? "" : Number(e.target.value))}
                  placeholder="Qty used"
                  className="w-28 rounded-md border border-[var(--border)] bg-transparent px-3 py-2 text-sm"
                />
              )}
            </div>
            <label className="flex items-center justify-between gap-2 text-sm text-[var(--text-dim)]">
              Total application time
              <TimePicker valueMinutes={minutesSpent} onChange={setMinutesSpent} mode="hoursMinutes" />
            </label>
            <input
              value={treatmentNotes}
              onChange={(e) => setTreatmentNotes(e.target.value)}
              placeholder="Notes (optional)"
              className="rounded-md border border-[var(--border)] bg-transparent px-3 py-2 text-sm"
            />
            {treatmentType === "spectral_light" && spectralProtocol.applicability !== "not_indicated" && (
              // The suggested schedule stays a plain description here,
              // never a pre-filled field value -- lib/spectral-light.ts's
              // "60 minutes mid-dark" default is a starting point for the
              // grower to read and act on, not a fact this form should
              // write to the record on their behalf. Positioned just above
              // Save (not above the inputs) so it reads as a final sanity
              // check against what was just typed, not a value to copy in.
              <div className="rounded-md p-2.5 text-xs" style={{ background: "var(--surface-raised)", color: "var(--text-dim)" }}>
                Suggested: {spectralProtocol.schedule}
              </div>
            )}
            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={submittingTreatment}
                className="self-start rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-[var(--on-accent)] disabled:opacity-50"
              >
                {submittingTreatment ? "Logging…" : "Log application"}
              </button>
              {treatmentQueued && <span className="text-xs text-[var(--text-dim)]">Saved offline, will sync</span>}
            </div>
          </form>

          <div className="card flex flex-col divide-y divide-[var(--border)]">
            {treatmentsList.length === 0 && <div className="p-4 text-sm text-[var(--text-dim)]">No treatments logged yet.</div>}
            {treatmentsList.map((t) => (
              <div key={t.id} className="px-4 py-3 text-sm">
                <div>
                  {displayNameForTreatmentType(t.type)}
                  {t.product && `: ${t.product}`}
                </div>
                {t.notes && <div className="text-[var(--text-dim)]">{t.notes}</div>}
                <div className="text-xs text-[var(--text-dim)]">
                  <LocalDate date={t.appliedAt} format={(d) => d.toLocaleDateString()} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="photos" className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Photos</h2>
        <div className="flex flex-col gap-4">
          {photos.length === 0 ? (
            // Empty state: no "No photos yet" text needed -- a big, centered
            // Add button already says everything there is to say here.
            <label className="card flex cursor-pointer flex-col items-center justify-center gap-2 p-10 text-center text-sm text-[var(--text-dim)]">
              {uploading ? "Uploading…" : "+ Add photo"}
              <input type="file" accept="image/*" capture="environment" className="hidden" onChange={handlePhotoUpload} />
            </label>
          ) : (
            // Add is the next tile in the grid's own flow (ticket B6/B7),
            // not a separate control above it -- it reflows automatically
            // as photos.length grows since it's just the last grid child.
            <div className="grid grid-cols-3 gap-2">
              {photos.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setSelectedPhotoId((prev) => (prev === p.id ? null : p.id))}
                  className="relative aspect-square overflow-hidden rounded-md"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- arbitrary Blob-hosted URLs, not a local/static asset */}
                  <img src={p.blobUrl} alt={p.caption ?? ""} className="h-full w-full object-cover" />
                  {selectedPhotoId === p.id && (
                    <div className="absolute inset-x-0 bottom-0 flex flex-col gap-0.5 bg-black/60 px-2 py-1.5 text-left text-white">
                      <span className="text-xs">{p.uploadedByUserId === currentUserId ? "You" : (p.uploadedByName ?? "Unknown")}</span>
                      <span className="text-[10px] opacity-80">
                        <LocalDate date={p.uploadedAt} format={(d) => d.toLocaleString()} />
                      </span>
                    </div>
                  )}
                </button>
              ))}
              <label className="flex aspect-square cursor-pointer flex-col items-center justify-center gap-1 rounded-md border border-dashed border-[var(--border)] text-center text-xs text-[var(--text-dim)]">
                {uploading ? "Uploading…" : "+ Add photo"}
                <input type="file" accept="image/*" capture="environment" className="hidden" onChange={handlePhotoUpload} />
              </label>
            </div>
          )}
          {photoQueued && <div className="text-xs text-[var(--text-dim)]">Photo saved offline. Will upload once you're back online.</div>}
        </div>
      </section>

      <section id="monitoring" className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Monitor hotspot</h2>
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
                    <span>
                      <LocalDate date={s.date} format={(d) => d.toLocaleDateString()} />
                    </span>
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
      </section>

      <section id="comments" className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Comments</h2>
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
                    {c.authorUserId ? initialsFor(c.authorName, c.authorEmail ?? "") : "-"}
                  </span>
                  <div className="flex flex-col gap-0.5">
                    <div className="flex items-center gap-2 text-xs text-[var(--text-dim)]">
                      <span className="font-medium text-[var(--text)]">
                        {c.authorUserId ? (c.authorUserId === currentUserId ? "You" : (c.authorName ?? c.authorEmail ?? "Someone")) : "Migrated note"}
                      </span>
                      <span>
                        <LocalDate date={c.createdAt} format={(d) => d.toLocaleString()} />
                      </span>
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
      </section>
    </div>
  );
}
