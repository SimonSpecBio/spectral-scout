"use client";

import Link from "next/link";
import { useState } from "react";

// Exactly four items per ARCHITECTURE.md section 5b's create sheet -- trap
// reading isn't a separate entry here anymore: it's reached from the Traps
// screen's own "Log readings" button instead, keeping this list matching
// spec rather than growing with every new capture method.
const ACTIONS = [
  { href: "/app/new-event", label: "Pest event" },
  { href: "/app/new-disease-event", label: "Pathogen event" },
  { href: "/app/new-observation", label: "Scouting log" },
  { href: "/app/new-treatment", label: "Application log" },
] as const;

// Single source of truth for the quick-action list, shared by its two
// triggers: the bottom nav's center circle on mobile/tablet, and the
// desktop Sidebar's inline "New" button (same job, different anchor point
// each time). A third "corner" FAB variant existed here previously but had
// no caller anywhere in the app -- the Sidebar's own button already covers
// desktop, so it was dead code rather than an unfinished affordance, and
// was removed instead of wired in.
export default function QuickActionsMenu({ variant }: { variant: "center" | "sidebar" }) {
  const [open, setOpen] = useState(false);
  const isSidebar = variant === "sidebar";

  if (isSidebar) {
    return (
      <div className="relative">
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-center justify-center gap-1.5 rounded-md bg-[var(--accent)] px-3 py-2 text-sm font-medium text-[var(--on-accent)]"
        >
          + New
        </button>
        {open && (
          <div className="card absolute left-0 right-0 top-full z-40 mt-1 flex flex-col gap-1 p-2">
            {ACTIONS.map((a) => (
              <Link
                key={a.href}
                href={a.href}
                onClick={() => setOpen(false)}
                className="whitespace-nowrap rounded-md px-3 py-2 text-sm hover:bg-[var(--surface-raised)]"
              >
                {a.label}
              </Link>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="relative flex flex-col items-center">
      {open && (
        <div className="card absolute bottom-full mb-3 flex w-44 flex-col gap-1 p-2">
          {ACTIONS.map((a) => (
            <Link
              key={a.href}
              href={a.href}
              onClick={() => setOpen(false)}
              className="whitespace-nowrap rounded-md px-4 py-2 text-sm hover:bg-[var(--surface-raised)]"
            >
              {a.label}
            </Link>
          ))}
        </div>
      )}
      {/* 00_bottom_nav.svg and ARCHITECTURE.md's nav table call this out as
          accent-colored ("plus (accent)") -- a solid coral circle with a
          background-colored ring stroke, which is what creates the "breaks
          out of the bar" cutout look against the bar behind it, plus a dark
          (not light) plus glyph on top of the bright fill. */}
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Quick actions"
        className="flex h-14 w-14 items-center justify-center rounded-full text-2xl shadow-lg transition-transform active:scale-95"
        style={{ background: "var(--accent)", border: "3px solid var(--surface)", color: "var(--on-accent)" }}
      >
        {open ? "×" : "+"}
      </button>
    </div>
  );
}
