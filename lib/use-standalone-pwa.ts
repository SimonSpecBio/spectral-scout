"use client";

import { useSyncExternalStore } from "react";

// Whether this page is running as an installed PWA (standalone display
// mode) rather than a normal browser tab -- the sign-in page (ticket
// recTJ5GagPLVKY62n) uses this to lead with the magic-link option instead
// of Google, since Google OAuth inside a standalone webview is unreliable
// on some Android/iOS versions. useSyncExternalStore (not a useState lazy
// initializer) because matchMedia doesn't exist during SSR -- the server
// has no display mode at all, so getServerSnapshot's `false` is the only
// safe default, corrected the moment the client subscribes. Same pattern
// as OfflineBanner.tsx's navigator.onLine read.
function subscribe(callback: () => void) {
  const mql = window.matchMedia("(display-mode: standalone)");
  mql.addEventListener("change", callback);
  return () => mql.removeEventListener("change", callback);
}
function getSnapshot() {
  return window.matchMedia("(display-mode: standalone)").matches;
}
function getServerSnapshot() {
  return false;
}

export function useStandalonePwa(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
