// The signed-in identity, as seen by browser-local storage (Task 763).
//
// Drafts, the offline queue and the failed store all live in this device's
// IndexedDB/localStorage, which is shared by every account that ever signs in
// on it. Without an owner, one user's autosaved draft or queued capture could
// be shown to -- or, worse, replayed to the server as -- a different user who
// signs in next. This module holds the current owner so those stores can be
// namespaced by it. It is deliberately tiny and framework-agnostic (plain
// module state, no React) so both lib/offline-queue.ts and lib/use-draft.ts
// can read it synchronously, including inside a render-time draft read.
//
// It is set once per app mount from the server-resolved session (see
// app/app/IdentityBoot.tsx) and updated on account switch. Use a stable,
// non-secret id (the user id), never anything sensitive.

let activeIdentity: string | null = null;
type Listener = () => void;
const listeners = new Set<Listener>();

// Normalizes to a non-empty trimmed string or null so "", undefined and null
// all collapse to the same "no owner known yet" state.
export function setActiveIdentity(id: string | null | undefined): void {
  const norm = typeof id === "string" && id.trim() ? id.trim() : null;
  if (norm === activeIdentity) return;
  activeIdentity = norm;
  listeners.forEach((l) => l());
}

export function getActiveIdentity(): string | null {
  return activeIdentity;
}

// Fires whenever the owner changes (account switch, sign-out, re-auth) so the
// offline queue and its badges can re-scope to the new owner.
export function onIdentityChanged(cb: Listener): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

// Prefixes a storage key with the current owner. Falls back to an "anon"
// bucket when the owner isn't known yet, so nothing is ever written to a
// key shared across accounts.
export function namespacedKey(base: string): string {
  return `u:${activeIdentity ?? "anon"}:${base}`;
}
