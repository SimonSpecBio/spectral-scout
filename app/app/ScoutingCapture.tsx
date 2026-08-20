"use client";

import { useState, type ReactNode } from "react";
import CountsFlow from "./CountsFlow";
import type { PickerFacility } from "./LocationPicker";
import MethodChoice, { type ScoutingMethod } from "./MethodChoice";
import MonitoringFlow from "./facilities/[id]/pest-events/[eventId]/monitoring/MonitoringFlow";

// Wraps MethodChoice + the two capture forms in one client tree that never
// unmounts on its own, so backing out to MethodChoice to reconsider never
// drops typed notes -- the same "nothing actually unmounts" trick
// CountsFlow/MonitoringFlow already rely on for LocationPicker's Cancel.
// Once a method is first picked, its form stays mounted (just hidden) for
// the rest of the session instead of being torn down and rebuilt.
export default function ScoutingCapture({
  header,
  postUrl,
  facilities,
  redirectHref,
  isPilotTier,
  taskId,
}: {
  header?: ReactNode;
  postUrl?: string;
  facilities?: PickerFacility[];
  redirectHref: string;
  isPilotTier: boolean;
  taskId?: string;
}) {
  const [method, setMethod] = useState<ScoutingMethod | null>(null);
  const [mounted, setMounted] = useState<Record<ScoutingMethod, boolean>>({
    plant_sampling: false,
    counts: false,
  });

  function selectMethod(m: ScoutingMethod) {
    setMounted((prev) => ({ ...prev, [m]: true }));
    setMethod(m);
  }

  return (
    <div className="mx-auto flex max-w-md flex-col gap-6">
      {header}
      {method !== null && (
        <button type="button" onClick={() => setMethod(null)} className="self-start text-sm text-[var(--text-dim)]">
          ← Change method
        </button>
      )}
      {method === null && <MethodChoice onSelect={selectMethod} />}
      {mounted.counts && (
        <div hidden={method !== "counts"}>
          <CountsFlow postUrl={postUrl} facilities={facilities} redirectHref={redirectHref} taskId={taskId} />
        </div>
      )}
      {mounted.plant_sampling && (
        <div hidden={method !== "plant_sampling"}>
          <MonitoringFlow
            postUrl={postUrl}
            facilities={facilities}
            redirectHref={redirectHref}
            isPilotTier={isPilotTier}
            taskId={taskId}
          />
        </div>
      )}
    </div>
  );
}
