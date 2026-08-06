"use client";

import Link from "next/link";
import { useState } from "react";

const ACTIONS = [
  { href: "/app/new-event", label: "Pest event" },
  { href: "/app/new-disease-event", label: "Pathogen event" },
  { href: "/app/new-observation", label: "Scouting log" },
  { href: "/app/log-trap-readings", label: "Trap reading" },
] as const;

// Single source of truth for the quick-action list, since it now has two
// triggers: the desktop corner FAB (unchanged) and the bottom nav's center
// circle on mobile/tablet (same job, different anchor point).
export default function QuickActionsMenu({ variant }: { variant: "corner" | "center" }) {
  const [open, setOpen] = useState(false);
  const isCorner = variant === "corner";

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
      {/* Small and muted, not a bright circle -- per the reference design
          (the mockup file was literally named "muted_fab"), kept for both
          variants so the center bottom-nav button isn't a jarring accent
          slab against the app's one-accent-means-attention rule. */}
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Quick actions"
        className={
          isCorner
            ? "flex h-[46px] w-[46px] items-center justify-center rounded-2xl text-xl transition-transform active:scale-95"
            : "flex h-14 w-14 -translate-y-4 items-center justify-center rounded-full text-2xl shadow-lg transition-transform active:scale-95"
        }
        style={{ background: "var(--surface-raised)", border: "0.5px solid var(--border-soft)", color: "var(--text-dim)" }}
      >
        {open ? "×" : "+"}
      </button>
    </div>
  );
}
