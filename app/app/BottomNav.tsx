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

const BAR_HEIGHT = 60; // px -- the tappable strip; the safe-area strip below it is separate padding, same fill color, so there's no visible gap
// Notch geometry as a fraction of the bar's full width (viewBox 0-300,
// notch spans 108-192). Expressing both the SVG cutout and the CSS
// spacer below as fractions -- not fixed px -- keeps them aligned on the
// same edges no matter the actual rendered width, even though the SVG is
// independently x/y-scaled (preserveAspectRatio="none").
const NOTCH_FRACTION = (192 - 108) / 300;

// Mobile/tablet's primary nav: one continuous bar (not four separate
// chips with gaps) with a carved notch the center quick-actions circle
// nests into, matching "sharing edges, no floating buttons, no dead
// space below them." Desktop is unchanged (HeaderMenu + corner FAB, see
// layout.tsx).
export default function BottomNav() {
  const pathname = usePathname();
  const [a, b, c, d] = NAV;

  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 lg:hidden">
      <div
        className="relative mx-auto max-w-md"
        style={{ background: "var(--surface)", paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <svg viewBox="0 0 300 100" preserveAspectRatio="none" className="block w-full" style={{ height: BAR_HEIGHT }}>
          <path d="M0,0 H108 C108,0 120,34 150,34 C180,34 192,0 192,0 H300 V100 H0 Z" fill="var(--surface)" />
          <path
            d="M0,0 H108 C108,0 120,34 150,34 C180,34 192,0 192,0 H300"
            fill="none"
            stroke="var(--border-soft)"
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
        <div className="absolute inset-x-0 top-0 flex items-stretch" style={{ height: BAR_HEIGHT }}>
          <NavButton item={a} active={pathname === a.href} shareEdge />
          <NavButton item={b} active={pathname === b.href} />
          <div style={{ flex: `0 0 ${NOTCH_FRACTION * 100}%` }} />
          <NavButton item={c} active={pathname === c.href} shareEdge />
          <NavButton item={d} active={pathname === d.href} />
        </div>
        <div className="absolute left-1/2 -translate-x-1/2" style={{ top: -32 }}>
          <QuickActionsMenu variant="center" />
        </div>
      </div>
    </nav>
  );
}

function NavButton({ item, active, shareEdge }: { item: { href: string; label: string }; active: boolean; shareEdge?: boolean }) {
  return (
    <Link
      href={item.href}
      className="flex items-center justify-center text-[11px]"
      style={{
        flex: "1 1 0",
        color: active ? "var(--accent)" : "var(--text-dim)",
        borderRight: shareEdge ? "0.5px solid var(--border-soft)" : undefined,
      }}
    >
      {item.label}
    </Link>
  );
}
