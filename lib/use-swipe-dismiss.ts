"use client";

import { useRef, useState } from "react";

const SWIPE_THRESHOLD_PX = 60;

// Shared swipe-to-dismiss behavior for the small fixed-position toasts
// (OfflineQueueBadge, OfflineBanner) -- a horizontal swipe past the
// threshold dismisses it, and dismissing re-arms automatically the next
// time `active` goes from false back to true (a fresh batch of pending
// syncs, a new offline stretch), rather than staying dismissed forever
// after the first swipe.
export function useSwipeDismiss(active: boolean) {
  const [dismissed, setDismissed] = useState(false);
  // Adjusting state during render off a STATE comparison, not a ref --
  // React's own documented pattern (react.dev "Adjusting state when a prop
  // changes") for resetting derived state without an effect, which would
  // run one paint late and let a fresh occurrence render as still-dismissed
  // for a frame. Refs specifically are off-limits during render (this
  // project's own react-hooks/refs rule), which is why this isn't a ref.
  const [prevActive, setPrevActive] = useState(active);
  if (active !== prevActive) {
    setPrevActive(active);
    if (active) setDismissed(false);
  }

  const touchStartX = useRef<number | null>(null);

  function onTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX;
  }
  function onTouchEnd(e: React.TouchEvent) {
    if (touchStartX.current == null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    touchStartX.current = null;
    if (Math.abs(dx) > SWIPE_THRESHOLD_PX) setDismissed(true);
  }

  return { dismissed, onTouchStart, onTouchEnd };
}
