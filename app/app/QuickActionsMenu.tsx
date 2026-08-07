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

// Single source of truth for the quick-action list, since it now has three
// triggers: the desktop corner FAB, the bottom nav's center circle on
// mobile/tablet, and the desktop Sidebar's inline "New" button (same job,
// different anchor point each time).
export default function QuickActionsMenu({ variant }: { variant: "corner" | "center" | "sidebar" }) {
  const [open, setOpen] = useState(false);
  const isCorner = variant === "corner";
  const isSidebar = variant === "sidebar";

  if (isSidebar) {
    return (
      <div className="relative">
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-center justify-center gap-1.5 rounded-md bg-[var(--accent)] px-3 py-2 text-sm font-medium text-[#0B1626]"
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
    <div className={isCorner ? "fixed bottom-6 right-4 z-30 flex flex-col items-end gap-2" : "relative flex flex-col items-center"}>
      {open && (
        <div
          className={`card flex flex-col gap-1 p-2 ${isCorner ? "" : "absolute bottom-full mb-3 w-44"}`}
        >
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
      {/* Desktop corner FAB stays muted (per the original "muted_fab"
          reference, unchanged there). The mobile bottom-nav center circle
          is different: 00_bottom_nav.svg and ARCHITECTURE.md's nav table
          both explicitly call it out as accent-colored ("plus (accent)"),
          overriding the muted rule for this one spot -- a solid coral
          circle with a background-colored ring stroke, which is what
          creates the "breaks out of the bar" cutout look against the bar
          behind it, plus a dark (not light) plus glyph on top of the
          bright fill. */}
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Quick actions"
        className={
          isCorner
            ? "flex h-[46px] w-[46px] items-center justify-center rounded-2xl text-xl transition-transform active:scale-95"
            : "flex h-14 w-14 items-center justify-center rounded-full text-2xl shadow-lg transition-transform active:scale-95"
        }
        style={
          isCorner
            ? { background: "var(--surface-raised)", border: "0.5px solid var(--border-soft)", color: "var(--text-dim)" }
            : { background: "var(--accent)", border: "3px solid var(--surface)", color: "#0D1524" }
        }
      >
        {open ? "×" : "+"}
      </button>
    </div>
  );
}
