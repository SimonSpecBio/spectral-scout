"use client";

import { useEffect, useState } from "react";
import { adoptOrphans, discardOrphans, getOrphanCount, onQueueChanged } from "@/lib/offline-queue";
import { useToastStackPosition } from "@/lib/toast-stack";

// Legacy pending/failed captures from before per-identity namespacing carry no
// owner (Task 763). They are never auto-replayed -- doing so could submit one
// person's field work as whoever is signed in now. This offers the current
// user the explicit choice the acceptance criteria require: claim them (the
// common case -- a pre-update device had a single user) so they sync, or
// discard them.
export default function OfflineQueueRecoveryBanner() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const refresh = () => getOrphanCount().then(setCount).catch(() => {});
    refresh();
    return onQueueChanged(refresh);
  }, []);

  const stackPosition = useToastStackPosition("top", "queue-recovery", count > 0);

  if (count <= 0) return null;

  return (
    <div
      className="fixed inset-x-4 z-40 mx-auto flex max-w-xs flex-col items-center gap-2 rounded-2xl p-3 text-center text-xs"
      style={{
        top: "1rem",
        background: "var(--surface)",
        border: "0.5px solid var(--accent)",
        color: "var(--text)",
        transform: stackPosition > 0 ? `translateY(${stackPosition * 2.75}rem)` : undefined,
      }}
    >
      {count} unsynced {count === 1 ? "capture" : "captures"} from a previous version. Sync them to your account, or discard.
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => adoptOrphans()}
          className="rounded-full px-3 py-1 font-medium"
          style={{ background: "var(--accent)", color: "var(--on-accent)" }}
        >
          Sync to my account
        </button>
        <button
          type="button"
          onClick={() => discardOrphans()}
          className="rounded-full px-3 py-1 font-medium"
          style={{ border: "0.5px solid var(--border)", color: "var(--text-dim)" }}
        >
          Discard
        </button>
      </div>
    </div>
  );
}
