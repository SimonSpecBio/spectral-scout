"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CONSENT_SECTIONS } from "@/lib/consent";
import { US_STATES } from "@/lib/us-states";
import FormField from "../FormField";
import SubmitButton from "../SubmitButton";

function ConsentBody() {
  return (
    <div className="flex flex-col gap-4 overflow-y-auto text-sm text-[var(--text-dim)]" style={{ maxHeight: "50vh" }}>
      {CONSENT_SECTIONS.map((section) => (
        <div key={section.heading} className="flex flex-col gap-1.5">
          <div className="text-sm font-medium text-[var(--text)]">{section.heading}</div>
          {section.paragraphs.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </div>
      ))}
    </div>
  );
}

export default function OnboardingForm({ initialName, needsProfile }: { initialName: string; needsProfile: boolean }) {
  const router = useRouter();
  // initialName defaults to the owner's email (auth.ts's provisioning
  // fallback, "name || email") -- pre-filled but selected-all so typing a
  // real org name immediately replaces it instead of requiring a manual
  // clear first.
  const [name, setName] = useState(initialName);
  const [state, setState] = useState("");
  // Only meaningful when needsProfile is true: the name/state form gates
  // into a consent modal on "Continue" rather than submitting directly --
  // consent-only mode (an existing org catching up after a version bump)
  // has nothing else to fill in, so it renders the same consent content
  // inline instead of behind an extra modal-open click.
  const [showConsentModal, setShowConsentModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function acceptAndSubmit() {
    setSubmitting(true);
    setError(null);
    const res = await fetch("/api/organizations", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...(needsProfile ? { name, state } : {}), consentAccepted: true }),
    });
    if (res.ok) {
      router.push("/app");
      router.refresh();
    } else {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Couldn't save your details. Try again.");
      setSubmitting(false);
    }
  }

  if (!needsProfile) {
    return (
      <div className="card flex flex-col gap-4 p-4">
        <ConsentBody />
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
        <SubmitButton onClick={acceptAndSubmit} disabled={submitting}>
          {submitting ? "Saving…" : "I Agree — Continue"}
        </SubmitButton>
      </div>
    );
  }

  return (
    <>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setShowConsentModal(true);
        }}
        className="card flex flex-col gap-4 p-4"
      >
        <FormField label="Organization name" required>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onFocus={(e) => e.target.select()}
            required
            className="rounded-md border border-[var(--border)] bg-transparent px-3 py-2 text-sm"
          />
        </FormField>
        <FormField label="State" required>
          <select
            value={state}
            onChange={(e) => setState(e.target.value)}
            required
            className="rounded-md border border-[var(--border)] bg-transparent px-3 py-2 text-sm"
          >
            <option value="" disabled style={{ background: "var(--surface)" }}>
              Select your state
            </option>
            {US_STATES.map((s) => (
              <option key={s.code} value={s.code} style={{ background: "var(--surface)" }}>
                {s.name}
              </option>
            ))}
          </select>
        </FormField>
        <p className="text-xs text-[var(--text-dim)]">
          Pesticide/biocontrol rules vary a lot by state -- we use this to show you products that are actually legal to
          use where you are.
        </p>
        <SubmitButton disabled={!name.trim() || !state}>Continue</SubmitButton>
      </form>

      {showConsentModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.5)" }}
        >
          <div className="flex w-full max-w-md flex-col gap-4 rounded-xl p-5" style={{ background: "var(--surface)" }}>
            <div className="text-lg font-semibold">Before you continue</div>
            <ConsentBody />
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
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowConsentModal(false)}
                disabled={submitting}
                className="rounded-md border border-[var(--border)] px-4 py-3 text-sm font-medium text-[var(--text-dim)] disabled:opacity-50"
              >
                Cancel
              </button>
              <SubmitButton onClick={acceptAndSubmit} disabled={submitting}>
                {submitting ? "Saving…" : "I Agree — Continue"}
              </SubmitButton>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
