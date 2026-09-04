"use client";

import Link from "next/link";
import { useState } from "react";
import {
  CLOSE_UP_MAX,
  CLOSE_UP_OPTIONS,
  EMPTY_ANSWERS,
  resolveSymptomTree,
  showCloseUpQuestion,
  showFliesUpQuestion,
  showRootsQuestion,
  WHERE_OPTIONS,
  type RootsOption,
  type SymptomAnswers,
} from "@/lib/symptom-tree";
import { displayNameForPestSpecies, findPestProgram } from "@/lib/treatments-catalog";

type Step = "where" | "spreading" | "closeup" | "roots" | "fliesup" | "decline" | "result";

function nextStep(current: Step, a: SymptomAnswers): Step {
  const order: Step[] = ["where", "spreading", "closeup", "roots", "fliesup", "decline", "result"];
  let i = order.indexOf(current) + 1;
  while (i < order.length) {
    const s = order[i];
    if (s === "closeup" && !showCloseUpQuestion(a.where)) { i++; continue; }
    if (s === "roots" && !showRootsQuestion(a.where)) { i++; continue; }
    if (s === "fliesup" && !showFliesUpQuestion(a.where, a.closeUp)) { i++; continue; }
    return s;
  }
  return "result";
}

function prevStep(current: Step, a: SymptomAnswers): Step {
  const order: Step[] = ["where", "spreading", "closeup", "roots", "fliesup", "decline", "result"];
  let i = order.indexOf(current) - 1;
  while (i >= 0) {
    const s = order[i];
    if (s === "closeup" && !showCloseUpQuestion(a.where)) { i--; continue; }
    if (s === "roots" && !showRootsQuestion(a.where)) { i--; continue; }
    if (s === "fliesup" && !showFliesUpQuestion(a.where, a.closeUp)) { i--; continue; }
    return s;
  }
  return "where";
}

function toggleIn<T>(list: T[], value: T, max?: number): T[] {
  if (list.includes(value)) return list.filter((v) => v !== value);
  if (max && list.length >= max) return list;
  return [...list, value];
}

export default function SymptomCheckFlow({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState<Step>("where");
  const [answers, setAnswers] = useState<SymptomAnswers>(EMPTY_ANSWERS);

  function go(a: SymptomAnswers) {
    setAnswers(a);
    setStep(nextStep(step, a));
  }
  function back() {
    setStep(prevStep(step, answers));
  }

  if (step === "result") {
    const result = resolveSymptomTree(answers);
    return (
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Result</span>
          <button type="button" onClick={onClose} className="text-sm text-[var(--text-dim)]">
            Close
          </button>
        </div>

        {result.candidates.length === 0 ? (
          <div className="card p-4 text-sm text-[var(--text-dim)]">{result.note}</div>
        ) : (
          <div className="card flex flex-col gap-3 p-4">
            <div className="text-sm text-[var(--text-dim)]">
              {result.confidence === "high" ? "Likely" : "Possible, worth a closer look:"}
            </div>
            <div className="flex flex-col gap-2">
              {result.candidates.map((id) => {
                const program = findPestProgram(id);
                const href =
                  program?.kind === "pathogen" ? `/app/new-disease-event?species=${id}` : `/app/new-event?species=${id}`;
                return (
                  <Link
                    key={id}
                    href={href}
                    className="flex items-center justify-between rounded-md border border-[var(--border)] px-3 py-2.5 text-sm"
                  >
                    <span>{displayNameForPestSpecies(id)}</span>
                    <span className="text-[var(--accent)]">Log this &rarr;</span>
                  </Link>
                );
              })}
            </div>
            <div className="text-xs text-[var(--text-dim)]">{result.note}</div>
          </div>
        )}

        {result.showHlvdCaveat && (
          <div className="card flex flex-col gap-1.5 p-4" style={{ background: "var(--warning-bg)" }}>
            <div className="text-sm font-medium">General decline can be hard to pin down by eye</div>
            <div className="text-xs text-[var(--text-dim)]">
              Stunting, brittle stems, or reduced vigor with no other clear sign can point at something a photo can&rsquo;t
              confirm either way -- a lab (PCR) test is the reliable way to check, not a visual guess.
            </div>
          </div>
        )}

        <div className="flex flex-col gap-2 border-t border-[var(--border)] pt-3">
          <span className="text-xs text-[var(--text-dim)]">Not what you&rsquo;re seeing, or want to look yourself?</span>
          <div className="flex gap-2">
            <Link href="/app/new-event" className="flex-1 rounded-md border border-[var(--border)] px-3 py-2 text-center text-sm text-[var(--text-dim)]">
              Pest event
            </Link>
            <Link
              href="/app/new-disease-event"
              className="flex-1 rounded-md border border-[var(--border)] px-3 py-2 text-center text-sm text-[var(--text-dim)]"
            >
              Disease event
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <button type="button" onClick={step === "where" ? onClose : back} className="text-sm text-[var(--text-dim)]">
          &larr; {step === "where" ? "Cancel" : "Back"}
        </button>
      </div>

      {step === "where" && (
        <div className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">Where do you see the problem?</h2>
          <p className="text-xs text-[var(--text-dim)]">Pick everything that applies.</p>
          <div className="flex flex-wrap gap-2">
            {WHERE_OPTIONS.map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => setAnswers((a) => ({ ...a, where: toggleIn(a.where, o.value) }))}
                className="rounded-full border px-3 py-1.5 text-sm"
                style={{
                  borderColor: answers.where.includes(o.value) ? "var(--accent)" : "var(--border)",
                  color: answers.where.includes(o.value) ? "var(--accent)" : "var(--text-dim)",
                }}
              >
                {o.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            disabled={answers.where.length === 0}
            onClick={() => go(answers)}
            className="mt-2 rounded-md bg-[var(--accent)] px-4 py-2.5 text-sm font-medium text-[var(--on-accent)] disabled:opacity-50"
          >
            Next
          </button>
        </div>
      )}

      {step === "spreading" && (
        <div className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">Is it spreading?</h2>
          <p className="text-xs text-[var(--text-dim)]">To other leaves, or other plants -- or staying in one spot?</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => go({ ...answers, spreading: true })}
              className="flex-1 rounded-md border border-[var(--border)] px-4 py-2.5 text-sm"
            >
              Spreading
            </button>
            <button
              type="button"
              onClick={() => go({ ...answers, spreading: false })}
              className="flex-1 rounded-md border border-[var(--border)] px-4 py-2.5 text-sm"
            >
              Staying put
            </button>
          </div>
        </div>
      )}

      {step === "closeup" && (
        <div className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">What does it look like up close?</h2>
          <p className="text-xs text-[var(--text-dim)]">Pick up to {CLOSE_UP_MAX}.</p>
          <div className="flex flex-wrap gap-2">
            {CLOSE_UP_OPTIONS.map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => setAnswers((a) => ({ ...a, closeUp: toggleIn(a.closeUp, o.value, CLOSE_UP_MAX) }))}
                className="rounded-full border px-3 py-1.5 text-sm"
                style={{
                  borderColor: answers.closeUp.includes(o.value) ? "var(--accent)" : "var(--border)",
                  color: answers.closeUp.includes(o.value) ? "var(--accent)" : "var(--text-dim)",
                }}
              >
                {o.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            disabled={answers.closeUp.length === 0}
            onClick={() => go(answers)}
            className="mt-2 rounded-md bg-[var(--accent)] px-4 py-2.5 text-sm font-medium text-[var(--on-accent)] disabled:opacity-50"
          >
            Next
          </button>
        </div>
      )}

      {step === "roots" && (
        <div className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">Have you checked the roots?</h2>
          <div className="flex flex-col gap-2">
            {(
              [
                ["unchecked", "Haven't checked"],
                ["healthy", "White and firm"],
                ["rotten", "Brown, black, or mushy"],
              ] as [RootsOption, string][]
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => go({ ...answers, roots: value })}
                className="rounded-md border border-[var(--border)] px-4 py-2.5 text-left text-sm"
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      {step === "fliesup" && (
        <div className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">When you disturb the plant, do the insects fly up?</h2>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => go({ ...answers, fliesUp: true })}
              className="flex-1 rounded-md border border-[var(--border)] px-4 py-2.5 text-sm"
            >
              Fly up
            </button>
            <button
              type="button"
              onClick={() => go({ ...answers, fliesUp: false })}
              className="flex-1 rounded-md border border-[var(--border)] px-4 py-2.5 text-sm"
            >
              Stay put
            </button>
          </div>
        </div>
      )}

      {step === "decline" && (
        <div className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">Any general wilting, stunting, or decline?</h2>
          <p className="text-xs text-[var(--text-dim)]">Beyond what you already picked above.</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => go({ ...answers, decline: true })}
              className="flex-1 rounded-md border border-[var(--border)] px-4 py-2.5 text-sm"
            >
              Yes
            </button>
            <button
              type="button"
              onClick={() => go({ ...answers, decline: false })}
              className="flex-1 rounded-md border border-[var(--border)] px-4 py-2.5 text-sm"
            >
              No
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
