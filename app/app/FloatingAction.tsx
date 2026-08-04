"use client";

import Link from "next/link";
import { useState } from "react";

// Global quick-action per the design brief -- "New Treatment"/"Photo"/
// "Quick note" all need an existing Pest Event as their target, so those
// stay inside that event's detail tabs (Treatments/Photos/Notes) rather
// than living here; this covers the two actions that make sense with no
// prior context: starting a new pest event, or logging routine scouting.
export default function FloatingAction() {
  const [open, setOpen] = useState(false);

  return (
    <div className="fixed bottom-20 right-4 z-30 flex flex-col items-end gap-2 sm:bottom-6">
      {open && (
        <div className="card flex flex-col gap-1 p-2">
          <Link
            href="/app/new-event"
            onClick={() => setOpen(false)}
            className="rounded-md px-4 py-2 text-sm hover:bg-[var(--surface-raised)]"
          >
            New pest event
          </Link>
          <Link
            href="/app/new-observation"
            onClick={() => setOpen(false)}
            className="rounded-md px-4 py-2 text-sm hover:bg-[var(--surface-raised)]"
          >
            New scouting observation
          </Link>
        </div>
      )}
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Quick actions"
        className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--accent)] text-2xl font-medium text-[#0B1626] shadow-lg transition-transform active:scale-95"
      >
        {open ? "×" : "+"}
      </button>
    </div>
  );
}
