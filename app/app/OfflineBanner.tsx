"use client";

import { useSyncExternalStore } from "react";
import { useToastStackPosition } from "@/lib/toast-stack";
import { useSwipeDismiss } from "@/lib/use-swipe-dismiss";

function subscribe(callback: () => void) {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
}
function getSnapshot() {
  return !navigator.onLine;
}
// The server has no concept of this browser's network status -- rendering
// "online" is the only safe default, corrected the moment the client
// subscribes. Reading navigator.onLine from a useState initializer instead
// would mismatch the server-rendered HTML and force a full remount (found
// in QA, 2026-09-04: this exact div hydration-mismatched every load).
function getServerSnapshot() {
  return false;
}

// Persistent, dismissible "you're offline" indicator (ticket request,
// 2026-09-04) -- deliberately a small toast matching OfflineQueueBadge's
// style, not the confusing full-page offline screen the service worker can
// show on some navigations (that's a separate, already-tracked bug).
export default function OfflineBanner() {
  const offline = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const { dismissed, onTouchStart, onTouchEnd } = useSwipeDismiss(offline);
  const visible = offline && !dismissed;
  const stackPosition = useToastStackPosition("top", "offline-banner", visible);

  if (!visible) return null;

  return (
    <div
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      className="fixed inset-x-4 top-4 z-40 mx-auto flex max-w-xs items-center justify-center gap-2 rounded-full px-3 py-1.5 text-xs"
      style={{
        background: "var(--warning-bg)",
        border: "0.5px solid var(--border-soft)",
        color: "var(--warning)",
        transform: stackPosition > 0 ? `translateY(${stackPosition * 2.75}rem)` : undefined,
      }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--warning)" }} />
      You&rsquo;re offline
    </div>
  );
}
