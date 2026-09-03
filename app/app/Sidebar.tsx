"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import NotificationBell from "./NotificationBell";
import QuickActionsMenu from "./QuickActionsMenu";

const PRIMARY = [
  { href: "/app", label: "Home" },
  { href: "/app/search", label: "Search" },
  { href: "/app/schedule", label: "Schedule" },
  { href: "/app/timeline", label: "Timeline" },
  { href: "/app/logs", label: "Logs" },
] as const;

const SECONDARY = [
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

// Desktop's primary nav (ARCHITECTURE.md section 5a: "no bottom bar. Use a left
// sidebar... same destinations plus the secondary ones; the [+] becomes a
// normal 'New' button"). Bottom nav (mobile/tablet) and this are driven off
// the same lg breakpoint in layout.tsx, never both visible at once.
export default function Sidebar({ email, isPilot }: { email: string | null | undefined; isPilot: boolean }) {
  const pathname = usePathname();

  return (
    <aside className="sticky top-8 hidden h-fit w-52 shrink-0 flex-col gap-6 lg:flex">
      <div className="flex items-start justify-between">
        <div>
          <div className="font-semibold">Spectral Scout</div>
          {isPilot && (
            <span className="mt-1 inline-block rounded-full bg-[var(--accent)]/20 px-2 py-0.5 text-xs text-[var(--accent)]">
              Pilot program
            </span>
          )}
        </div>
        <NotificationBell />
      </div>

      <QuickActionsMenu variant="sidebar" />

      <nav className="flex flex-col gap-0.5">
        {PRIMARY.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="rounded-md px-2.5 py-1.5 text-sm"
            style={{
              color: pathname === item.href ? "var(--text)" : "var(--text-dim)",
              background: pathname === item.href ? "var(--surface-raised)" : "transparent",
            }}
          >
            {item.label}
          </Link>
        ))}
      </nav>

      <nav className="flex flex-col gap-0.5 border-t border-[var(--border)] pt-4">
        {SECONDARY.map((item) => {
          // Settings needs an exact match, not startsWith -- otherwise
          // visiting /app/settings/catalog would highlight both it AND
          // Settings, since "Species & thresholds" is now a sub-path of
          // Settings that also has its own top-level nav entry.
          const active = item.href === "/app/settings" ? pathname === item.href : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-md px-2.5 py-1.5 text-sm"
              style={{
                color: active ? "var(--text)" : "var(--text-dim)",
                background: active ? "var(--surface-raised)" : "transparent",
              }}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto flex flex-col gap-1 border-t border-[var(--border)] pt-4">
        {email && <div className="truncate px-2.5 text-xs text-[var(--text-dim)]">{email}</div>}
        <Link href="/api/auth/signout" className="rounded-md px-2.5 py-1.5 text-sm text-[var(--text-dim)]">
          Sign out
        </Link>
      </div>
    </aside>
  );
}
