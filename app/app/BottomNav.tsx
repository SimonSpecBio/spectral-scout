"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import QuickActionsMenu from "./QuickActionsMenu";

const NAV = [
  {
    href: "/app",
    label: "Home",
    icon: (active: boolean) => (
      <g fill="none" stroke={active ? "var(--text)" : "var(--text-faint)"} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round">
        <path d="M2 8 l6 -2.4 l6 2.4 l6 -2.4 v12 l-6 2.4 l-6 -2.4 l-6 2.4 z" />
        <path d="M8 4.4 v12 M14 6 v12" />
      </g>
    ),
  },
  {
    href: "/app/schedule",
    label: "Schedule",
    icon: (active: boolean) => (
      <g fill="none" stroke={active ? "var(--text)" : "var(--text-faint)"} strokeWidth="1.5" strokeLinecap="round">
        <rect x="2" y="4" width="18" height="16" rx="2.5" />
        <path d="M2 9 h18 M7 1.5 v5 M15 1.5 v5" />
      </g>
    ),
  },
  {
    href: "/app/timeline",
    label: "Timeline",
    icon: (active: boolean) => (
      <g stroke={active ? "var(--text)" : "var(--text-faint)"} strokeWidth="1.5" strokeLinecap="round">
        <line x1="4" y1="3" x2="4" y2="19" />
        <circle cx="4" cy="7" r="1.8" fill={active ? "var(--text)" : "var(--text-faint)"} stroke="none" />
        <circle cx="4" cy="15" r="1.8" fill={active ? "var(--text)" : "var(--text-faint)"} stroke="none" />
        <line x1="9" y1="7" x2="19" y2="7" />
        <line x1="9" y1="15" x2="17" y2="15" />
      </g>
    ),
  },
  {
    href: "/app/logs",
    label: "Logs",
    icon: (active: boolean) => (
      <g stroke={active ? "var(--text)" : "var(--text-faint)"} strokeWidth="1.5" strokeLinecap="round">
        <line x1="2" y1="4" x2="18" y2="4" />
        <line x1="2" y1="10" x2="18" y2="10" />
        <line x1="2" y1="16" x2="12" y2="16" />
      </g>
    ),
  },
] as const;

// Mobile/tablet's primary nav (00_bottom_nav.svg / ARCHITECTURE.md section 5a):
// Home ยท Schedule ยท [+] ยท Timeline ยท Logs. Icons + tiny mono labels sit
// directly on one continuous bar (no per-tab chip backgrounds or gaps --
// hairline dividers only between adjacent tabs, none around the center
// circle's own gap). Desktop uses Sidebar instead (see layout.tsx).
export default function BottomNav() {
  const pathname = usePathname();
  const [a, b, c, d] = NAV;

  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 lg:hidden" style={{ background: "var(--surface)", paddingBottom: "env(safe-area-inset-bottom)" }}>
      <div className="relative mx-auto flex h-[62px] max-w-md items-stretch" style={{ borderTop: "0.5px solid var(--border-soft)" }}>
        <NavItem item={a} active={pathname === a.href} divider />
        <NavItem item={b} active={pathname === b.href} />
        <div className="w-[64px] shrink-0" />
        <NavItem item={c} active={pathname === c.href} divider />
        <NavItem item={d} active={pathname === d.href} />
        <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-center">
          <div className="pointer-events-auto -translate-y-3">
            <QuickActionsMenu variant="center" />
          </div>
        </div>
      </div>
    </nav>
  );
}

function NavItem({ item, active, divider }: { item: (typeof NAV)[number]; active: boolean; divider?: boolean }) {
  return (
    <Link
      href={item.href}
      className="flex flex-1 flex-col items-center justify-center gap-1"
      style={{ borderRight: divider ? "0.5px solid var(--border-soft)" : undefined }}
    >
      <svg width="20" height="20" viewBox="0 0 20 20">
        {item.icon(active)}
      </svg>
      <span className="label-mono" style={{ color: active ? "var(--text)" : "var(--text-faint)", fontSize: "11px", letterSpacing: "0.06em" }}>
        {item.label.toUpperCase()}
      </span>
    </Link>
  );
}
