"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import QuickActionsMenu from "./QuickActionsMenu";

const NAV = [
  { href: "/app", label: "Home" },
  { href: "/app/events", label: "Events" },
  { href: "/app/timeline", label: "Timeline" },
  { href: "/app/more", label: "More" },
] as const;

// Mobile/tablet's primary nav -- a 5-slot spread (4 small rect destinations
// + a larger center circle for quick actions) replaces the hamburger menu
// on small screens; desktop keeps HeaderMenu (see layout.tsx, which shows
// each at its own breakpoint) since a bottom bar competing with a mouse
// cursor for screen real estate doesn't make sense there. The center
// circle takes over the corner FAB's exact job (QuickActionsMenu), just
// anchored in the bar instead of floating over content.
export default function BottomNav() {
  const pathname = usePathname();
  const left = NAV.slice(0, 2);
  const right = NAV.slice(2);

  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 lg:hidden">
      <div
        className="mx-auto flex max-w-md items-center justify-between gap-1.5 px-3 pb-[max(10px,env(safe-area-inset-bottom))] pt-2"
        style={{ background: "var(--surface)", borderTop: "0.5px solid var(--border-soft)" }}
      >
        {left.map((item) => (
          <NavButton key={item.href} href={item.href} label={item.label} active={pathname === item.href} />
        ))}
        <QuickActionsMenu variant="center" />
        {right.map((item) => (
          <NavButton key={item.href} href={item.href} label={item.label} active={pathname === item.href} />
        ))}
      </div>
    </nav>
  );
}

function NavButton({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      className="flex flex-1 flex-col items-center justify-center rounded-lg py-2 text-[11px]"
      style={{
        background: "var(--surface-raised)",
        border: `0.5px solid ${active ? "var(--accent)" : "var(--border-soft)"}`,
        color: active ? "var(--accent)" : "var(--text-dim)",
      }}
    >
      {label}
    </Link>
  );
}
