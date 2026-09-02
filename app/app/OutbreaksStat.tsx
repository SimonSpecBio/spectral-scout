"use client";

import Link from "next/link";
import { useState } from "react";
import { displayNameForPestSpecies } from "@/lib/treatments-catalog";

export interface OutbreakEventRow {
  id: string;
  facilityId: string;
  pestSpecies: string;
  facilityName: string;
  areaName: string | null;
}

// Tapping the stat reveals which events it's actually counting, each
// linking to its own detail page -- the count alone gave no way to act on
// it (Simon, ticket B11). The list is already in scope in page.tsx (the
// count is just its .length), so this needed no new route.
export default function OutbreaksStat({
  outbreaksThisWeek,
  outbreaksLastWeek,
  thisWeekEvents,
}: {
  outbreaksThisWeek: number;
  outbreaksLastWeek: number;
  thisWeekEvents: OutbreakEventRow[];
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="card flex flex-col gap-2 p-4 text-sm">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        disabled={thisWeekEvents.length === 0}
        className="flex items-center gap-2 text-left disabled:cursor-default"
      >
        <span style={{ color: outbreaksThisWeek < outbreaksLastWeek ? "var(--success)" : "var(--text)" }}>
          {outbreaksThisWeek} new {outbreaksThisWeek === 1 ? "outbreak" : "outbreaks"} this week
        </span>
        <span className="text-[var(--text-dim)]">vs {outbreaksLastWeek} last week</span>
        {thisWeekEvents.length > 0 && <span className="ml-auto text-[var(--text-faint)]">{expanded ? "▲" : "▼"}</span>}
      </button>
      {expanded && (
        <div className="flex flex-col divide-y divide-[var(--border)]">
          {thisWeekEvents.map((e) => (
            <Link
              key={e.id}
              href={`/app/facilities/${e.facilityId}/pest-events/${e.id}`}
              className="flex items-center justify-between gap-3 py-2 text-sm text-[var(--text)]"
            >
              <span className="capitalize">{displayNameForPestSpecies(e.pestSpecies)}</span>
              <span className="text-xs text-[var(--text-dim)]">
                {e.areaName ? `${e.areaName}, ` : ""}
                {e.facilityName}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
