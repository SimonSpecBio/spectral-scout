"use client";

import { useState } from "react";

// The "swipe to the other way of logging this" gesture Simon asked for
// (live feedback, 2026-09-07) on event-creation forms, paired with a
// tappable segmented control -- same swipe-plus-visible-fallback pattern
// LocationPicker already uses for switching facilities, so a grower who
// doesn't discover the swipe still has an obvious way to get there.
export function useSwipeableMethod<T extends string>(methods: readonly T[], initial: T) {
  const [method, setMethod] = useState<T>(initial);
  const [touchStartX, setTouchStartX] = useState<number | null>(null);

  function onTouchStart(e: React.TouchEvent) {
    setTouchStartX(e.touches[0].clientX);
  }
  function onTouchEnd(e: React.TouchEvent) {
    if (touchStartX == null) return;
    const dx = e.changedTouches[0].clientX - touchStartX;
    const idx = methods.indexOf(method);
    if (dx < -50 && idx < methods.length - 1) setMethod(methods[idx + 1]);
    else if (dx > 50 && idx > 0) setMethod(methods[idx - 1]);
    setTouchStartX(null);
  }

  return { method, setMethod, onTouchStart, onTouchEnd };
}

export function MethodTabs<T extends string>({
  methods,
  labels,
  method,
  onSelect,
}: {
  methods: readonly T[];
  labels: Record<T, string>;
  method: T;
  onSelect: (m: T) => void;
}) {
  return (
    <div className="flex gap-1 rounded-lg border border-[var(--border)] p-1">
      {methods.map((m) => (
        <button
          type="button"
          key={m}
          onClick={() => onSelect(m)}
          className="flex-1 rounded-md py-1.5 text-xs font-medium"
          style={
            method === m
              ? { background: "var(--accent)", color: "var(--on-accent)" }
              : { color: "var(--text-dim)" }
          }
        >
          {labels[m]}
        </button>
      ))}
    </div>
  );
}
