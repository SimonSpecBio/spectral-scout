"use client";

import { useEffect, useState } from "react";
import { namespacedKey } from "@/lib/client-identity";

// Extracted from six near-identical copies (CountsFlow, MonitoringFlow,
// DiseaseMonitoringFlow, NewEventForm, DiseaseEventForm, NewTreatmentForm)
// that each hand-rolled the same "restore a JSON draft from localStorage,
// autosave it on every change, clear it on successful submit" boilerplate
// (Airtable ticket recVXbUdQ2Hed8ypt). Split into two small hooks rather
// than one combined useState-like hook: the read has to happen once,
// synchronously, before any of a form's own per-field useState calls (so
// each field can seed its own initial value from the same restored draft),
// while the write is a plain effect keyed on whatever combined value the
// form wants to persist -- forcing both into one hook call would mean
// either giving up each form's own per-field validation/fallback rules
// (they differ: array-length checks, enum membership, numeric coercion) or
// bundling every draft field into one opaque state object, which several
// forms can't do cleanly (NewEventForm/DiseaseEventForm branch a THIRD
// decision -- whether to apply a symptom-tree preset at all -- off whether
// a draft exists for a specific field, not just that field's own restored
// value). Keeping the read and write as two calls lets every existing
// per-field useState line stay exactly as it was, just swapping the
// duplicated boilerplate for a one-line call.

// Reads a previously-autosaved JSON draft once, as part of the initial
// render (a lazy useState initializer, not an effect) -- avoids both a
// flash of empty state before restoration and the react-hooks/set-state-
// in-effect lint rule. Returns the raw parsed object (or null); callers
// validate and default each field themselves, exactly as every original
// copy already did.
// Keys are namespaced by the signed-in identity (Task 763) so a draft
// autosaved by one account is never restored into a form for a different
// account that signs in next on the same device.
export function useDraftValue(key: string): unknown {
  const [draft] = useState(() => {
    try {
      const raw = localStorage.getItem(namespacedKey(key));
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });
  return draft;
}

// Autosaves `value` under `key` on every change -- a side effect on an
// external system (localStorage), which is what effects are for; no
// setState here. Returns a `clear` function for callers to invoke once the
// draft has been submitted successfully.
export function useDraftAutosave(key: string, value: unknown): () => void {
  useEffect(() => {
    try {
      localStorage.setItem(namespacedKey(key), JSON.stringify(value));
    } catch {
      /* storage full or unavailable */
    }
  }, [key, value]);

  return function clear() {
    try {
      localStorage.removeItem(namespacedKey(key));
    } catch {
      /* ignore */
    }
  };
}
