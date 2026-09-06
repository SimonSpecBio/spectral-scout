"use client";

import { useEffect, useState } from "react";
import { dismissFailed, getFailed, onQueueChanged, type FailedRequest } from "@/lib/offline-queue";
import { useToastStackPosition } from "@/lib/toast-stack";

// Surfaces items the offline queue gave up on for good (ticket
// recAAWHkGTiiWDH5C) -- these used to just be deleted, indistinguishable
// from a successful sync. Danger-colored (not the neutral "pending sync"
// badge's styling) since these need the grower's attention: re-enter this
// by hand, or consciously drop it.
export default function OfflineQueueFailedBadge() {
  const [failed, setFailed] = useState<FailedRequest[]>([]);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const refresh = () => getFailed().then(setFailed);
    refresh();
    return onQueueChanged(refresh);
  }, []);

  const visible = failed.length > 0;
  const stackPosition = useToastStackPosition("top", "offline-queue-failed", visible);

  if (!visible) return null;

  return (
    <div
      className="fixed inset-x-4 z-40 mx-auto flex max-w-xs flex-col gap-2 rounded-2xl p-3 text-xs"
      style={{
        top: "1rem",
        background: "var(--danger-bg)",
        border: "0.5px solid var(--danger)",
        color: "var(--danger)",
        transform: stackPosition > 0 ? `translateY(${stackPosition * 2.75}rem)` : undefined,
      }}
    >
      <button type="button" onClick={() => setExpanded((v) => !v)} className="flex items-center justify-center gap-2 rounded-full">
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--danger)" }} />
        {failed.length} couldn&rsquo;t be saved
      </button>
      {expanded && (
        <div className="flex flex-col divide-y divide-[var(--danger)]/20">
          {failed.map((f) => (
            <div key={f.id} className="flex items-center justify-between gap-2 py-1.5">
              <span className="truncate">{f.label}</span>
              <button
                type="button"
                onClick={() => dismissFailed(f.id)}
                className="shrink-0 rounded-full border border-[var(--danger)] px-2 py-0.5"
              >
                Discard
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
