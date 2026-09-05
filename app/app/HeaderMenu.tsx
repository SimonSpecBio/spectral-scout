"use client";

import Link from "next/link";
import { useState } from "react";
import { signOutAction } from "@/lib/auth-actions";

const SECONDARY = [
  { href: "/app/search", label: "Search" },
  { href: "/app/events", label: "Events" },
  { href: "/app/traps", label: "Sticky traps" },
  { href: "/app/rei-phi", label: "REI & PHI" },
  { href: "/app/preventive", label: "Preventive checklist" },
  { href: "/app/inventory", label: "Inventory" },
  { href: "/app/team", label: "Team" },
  { href: "/app/facilities", label: "Sites" },
  { href: "/app/settings/catalog", label: "Species & thresholds" },
  { href: "/app/settings", label: "Settings" },
] as const;

// Mobile/tablet's entry point to secondary screens -- primary nav lives in
// BottomNav now, so this holds everything ARCHITECTURE.md section 5a calls out as
// "reached from the Dashboard header" instead: Sites, Traps, Inventory,
// REI/PHI, Team, plus account/sign-out. Desktop doesn't render this at all
// (Sidebar has the same links inline), same lg breakpoint as BottomNav.
export default function HeaderMenu({ email }: { email: string | null | undefined }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative lg:hidden">
      <button onClick={() => setOpen((v) => !v)} aria-label="More" className="flex h-8 w-8 items-center justify-center text-[var(--text-faint)]">
        <svg width="18" height="18" viewBox="0 0 18 18" fill="currentColor">
          <circle cx="3" cy="9" r="1.6" />
          <circle cx="9" cy="9" r="1.6" />
          <circle cx="15" cy="9" r="1.6" />
        </svg>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="card absolute right-0 top-10 z-40 flex w-56 flex-col gap-1 p-2">
            {SECONDARY.map((item) => (
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
            <form action={signOutAction}>
              <button type="submit" className="w-full rounded-md px-3 py-2 text-left text-sm hover:bg-[var(--surface-raised)]">
                Sign out
              </button>
            </form>
          </div>
        </>
      )}
    </div>
  );
}
