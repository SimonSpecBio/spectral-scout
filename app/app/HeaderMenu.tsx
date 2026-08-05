"use client";

import Link from "next/link";
import { useState } from "react";

// The account/settings entry point -- didn't exist anywhere in the app
// before this (no sign-out button existed at all). Kept separate from the
// "More" tab, which is about app features (Sites, Coming soon); this is
// specifically account-level.
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
