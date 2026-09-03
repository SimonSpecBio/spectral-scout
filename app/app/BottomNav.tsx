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
        {/* Creases at the same x as the roofline's own ridge points (8/14),
            spanning exactly that ridge's top y to its mirrored bottom y --
            they used to start above the top edge and stop short of the
            bottom on both sides (ticket found in QA, 2026-09-03). */}
        <path d="M8 5.6 v12 M14 8 v12" />
      </g>
    ),
  },
  {
    href: "/app/schedule",
    label: "Schedule",
    icon: (active: boolean) => (
      <g fill="none" stroke={active ? "var(--text)" : "var(--text-faint)"} strokeWidth="1.5" strokeLinecap="round">
        {/* Right/bottom edges used to sit flush on the viewBox boundary
            (x+width and y+height both = 20), so half the centered stroke
            got clipped by the SVG's own edge -- a visibly thinner line on
            those two sides (ticket found in QA, 2026-09-03). 2px margin
            all around now, same as the other three nav icons. */}
        <rect x="2" y="4" width="16" height="14" rx="2.5" />
        <path d="M2 9 h16 M7 1.5 v5 M15 1.5 v5" />
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
      // A spreadsheet/table grid -- the previous version (three stacked
      // horizontal lines) read too similarly to Timeline's own icon at nav
      // size (ticket found in QA, 2026-09-03); Logs is the filterable
      // table-like record, Timeline is the narrative rail, so the icons
      // should look as different as those two screens actually are.
      <g fill="none" stroke={active ? "var(--text)" : "var(--text-faint)"} strokeWidth="1.5" strokeLinejoin="round">
        <rect x="2" y="3" width="16" height="14" rx="1.5" />
        <line x1="2" y1="10" x2="18" y2="10" />
        <line x1="10" y1="3" x2="10" y2="17" />
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
