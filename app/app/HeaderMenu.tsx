"use client";

import Link from "next/link";
import { useState } from "react";

const NAV = [
  { href: "/app", label: "Home" },
  { href: "/app/events", label: "Events" },
  { href: "/app/timeline", label: "Timeline" },
  { href: "/app/more", label: "More" },
] as const;

// The one navigation menu -- also holds the account/settings entry point
// (no sign-out button existed anywhere in the app before this). Replaces
// the old fixed bottom tab bar entirely: one corner menu for everything,
// matching the reference design's single "..." affordance instead of a
// persistent bottom bar competing for screen space on a phone.
export default function HeaderMenu({ email }: { email: string | null | undefined }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button onClick={() => setOpen((v) => !v)} aria-label="Menu" className="flex h-8 w-8 items-center justify-center text-[var(--text-faint)]">
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
          <path d="M2 4.5h14M2 9h14M2 13.5h14" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="card absolute right-0 top-10 z-40 flex w-56 flex-col gap-1 p-2">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className="rounded-md px-3 py-2 text-sm hover:bg-[var(--surface-raised)]"
              >
                {item.label}
              </Link>
            ))}
            <div className="my-1 border-t border-[var(--border)]" />
            {email && <div className="px-3 py-2 text-xs text-[var(--text-dim)]">{email}</div>}
            <Link href="/api/auth/signout" className="rounded-md px-3 py-2 text-sm hover:bg-[var(--surface-raised)]">
              Sign out
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
