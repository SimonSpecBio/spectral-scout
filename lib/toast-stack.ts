import { useEffect, useSyncExternalStore } from "react";

// Coordinates the app's small set of fixed-position toast/banner components
// (OfflineQueueBadge, InstallPrompt, PwaRegister's update toast) so two
// visible at once stack instead of rendering on top of each other --
// InstallPrompt and PwaRegister's toast both sit at the exact same
// "fixed inset-x-4 bottom-24 ... lg:bottom-6" position and can genuinely
// coexist (PwaRegister lives in the root layout, InstallPrompt in the /app
// layout, so both mount on every /app/* page). A plain external store
// rather than React context, since there's no single ancestor those three
// components share to hang a provider on.
type Slot = "top" | "bottom";

const active: Record<Slot, string[]> = { top: [], bottom: [] };
const listeners = new Set<() => void>();

function notify() {
  for (const l of listeners) l();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function show(slot: Slot, id: string) {
  if (!active[slot].includes(id)) {
    active[slot].push(id);
    notify();
  }
}

function hide(slot: Slot, id: string) {
  const i = active[slot].indexOf(id);
  if (i !== -1) {
    active[slot].splice(i, 1);
    notify();
  }
}

// Registers this toast as visible/hidden and returns its position (0 =
// base slot position, 1 = one stacked above/below it, etc.) among
// currently-visible toasts sharing the same slot, in registration order.
export function useToastStackPosition(slot: Slot, id: string, isVisible: boolean): number {
  useEffect(() => {
    if (isVisible) show(slot, id);
    else hide(slot, id);
    return () => hide(slot, id);
  }, [slot, id, isVisible]);

  return useSyncExternalStore(
    subscribe,
    () => active[slot].indexOf(id),
    () => -1
  );
}
