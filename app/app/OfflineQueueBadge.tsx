"use client";

import { useEffect, useState } from "react";
import { getPending, initOfflineQueue, onQueueChanged } from "@/lib/offline-queue";
import { useToastStackPosition } from "@/lib/toast-stack";
import { useSwipeDismiss } from "@/lib/use-swipe-dismiss";

// Small persistent indicator so a scout who just submitted something with
// no signal knows it was saved, not lost -- "the UI shows a small 'pending
// sync' indicator; nothing is lost in a dead zone" (INSTALL_PWA.md ยง2).
// Swipeable-away (ticket request, 2026-09-04) since a scout who already
// knows their work queued shouldn't have it sitting there blocking the
// header on every screen until it happens to sync.
export default function OfflineQueueBadge() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    initOfflineQueue();
    const refresh = () => getPending().then((p) => setCount(p.length));
    refresh();
    return onQueueChanged(refresh);
  }, []);

  const { dismissed, onTouchStart, onTouchEnd } = useSwipeDismiss(count > 0);
  const visible = count > 0 && !dismissed;
  const stackPosition = useToastStackPosition("top", "offline-queue", visible);

  if (!visible) return null;

  return (
    <div
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      className="fixed inset-x-4 top-4 z-40 mx-auto flex max-w-xs items-center justify-center gap-2 rounded-full px-3 py-1.5 text-xs"
      style={{
        background: "var(--surface-raised)",
        border: "0.5px solid var(--border-soft)",
        color: "var(--text-dim)",
        transform: stackPosition > 0 ? `translateY(${stackPosition * 2.75}rem)` : undefined,
      }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--accent)" }} />
      {count} pending sync{count === 1 ? "" : "s"}
    </div>
  );
}
