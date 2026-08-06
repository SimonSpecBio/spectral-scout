"use client";

import Link from "next/link";
import { useState } from "react";

// Global quick-action per the design brief -- "New Treatment"/"Photo"/
// "Quick note" all need an existing Pest Event as their target, so those
// stay inside that event's detail tabs (Treatments/Photos/Notes) rather
// than living here; this covers the actions that make sense with no prior
// context: starting a new pest event, a new pathogen (disease) event, or
// logging routine scouting.
export default function FloatingAction() {
  const [open, setOpen] = useState(false);

  return (
    <div className="fixed bottom-6 right-4 z-30 flex flex-col items-end gap-2">
      {open && (
        <div className="card flex flex-col gap-1 p-2">
          <Link
            href="/app/new-event"
            onClick={() => setOpen(false)}
            className="rounded-md px-4 py-2 text-sm hover:bg-[var(--surface-raised)]"
          >
            Pest event
          </Link>
          <Link
            href="/app/new-disease-event"
            onClick={() => setOpen(false)}
            className="rounded-md px-4 py-2 text-sm hover:bg-[var(--surface-raised)]"
          >
            Pathogen event
          </Link>
          <Link
            href="/app/new-observation"
            onClick={() => setOpen(false)}
            className="rounded-md px-4 py-2 text-sm hover:bg-[var(--surface-raised)]"
          >
            Scouting log
          </Link>
        </div>
      )}
      {/* Small and muted, not a bright circle -- per the reference design
          (the mockup file was literally named "muted_fab"). */}
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Quick actions"
        className="flex h-[46px] w-[46px] items-center justify-center rounded-2xl text-xl transition-transform active:scale-95"
        style={{ background: "var(--surface-raised)", border: "0.5px solid var(--border-soft)", color: "var(--text-dim)" }}
      >
        {open ? "×" : "+"}
      </button>
    </div>
  );
}
