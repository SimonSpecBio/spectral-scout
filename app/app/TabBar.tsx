"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/app", label: "Home" },
  { href: "/app/events", label: "Events" },
  { href: "/app/timeline", label: "Timeline" },
  { href: "/app/more", label: "More" },
] as const;

// Fixed bottom bar on mobile widths (where it matters most per the design
// brief); becomes a normal top-of-content row on wider screens instead of
// floating over content nobody scrolls edge-to-edge on desktop.
export default function TabBar() {
  const pathname = usePathname();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-[var(--border)] bg-[var(--surface)] sm:static sm:border-0 sm:bg-transparent">
      <div className="mx-auto flex max-w-5xl justify-around px-2 py-2 sm:justify-start sm:gap-6 sm:px-0 sm:py-0">
        {TABS.map((tab) => {
          // "/app" itself would match every sub-route's startsWith check --
          // Home needs an exact match, the other tabs still want their
          // whole subtree (e.g. /app/events/[id]) to read as active.
          const active = tab.href === "/app" ? pathname === "/app" : pathname.startsWith(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`px-2 py-1 text-sm ${active ? "text-[var(--accent)]" : "text-[var(--text-dim)]"}`}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
