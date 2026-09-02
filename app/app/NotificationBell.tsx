"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { loadRead } from "@/lib/notifications-read";

// Shared by the mobile header (layout.tsx) and the desktop Sidebar -- same
// bell, same unread logic, in two different nav chromes. Fetches its own
// data client-side (/api/notifications) rather than the server-rendered
// layout computing it for every page: computeNotifications() derives from
// several tables per organization, and layout.tsx wraps every /app/* page,
// so doing that server-side here would add that cost to every navigation
// just to light up a dot (Airtable ticket B10).
export default function NotificationBell() {
  const pathname = usePathname();
  const [hasUnread, setHasUnread] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/notifications")
      .then((res) => (res.ok ? res.json() : []))
      .then((notifications: { id: string }[]) => {
        if (cancelled) return;
        const read = loadRead();
        setHasUnread(notifications.some((n) => !read.has(n.id)));
      })
      .catch(() => {
        /* leave hasUnread false -- a failed check shouldn't show a false dot */
      });
    return () => {
      cancelled = true;
    };
    // Re-checks on every navigation (pathname change) -- the common case
    // this needs to catch is "just came back from /app/notifications",
    // which already calls saveRead() there and should clear the dot here
    // right away rather than waiting for some unrelated future refresh.
  }, [pathname]);

  return (
    <Link
      href="/app/notifications"
      aria-label="Notifications"
      className="relative flex h-8 w-8 shrink-0 items-center justify-center"
      style={{ color: pathname === "/app/notifications" ? "var(--text)" : "var(--text-faint)" }}
    >
      <svg width="17" height="17" viewBox="0 0 17 17" fill="none">
        <path
          d="M8.5 1.5c-2 0-3.5 1.6-3.5 3.6v2.4l-1 2.5h9l-1-2.5V5.1c0-2-1.5-3.6-3.5-3.6z"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeLinejoin="round"
        />
        <path d="M7 12.5a1.5 1.5 0 0 0 3 0" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      </svg>
      {hasUnread && (
        <span className="absolute right-1 top-1 h-2 w-2 rounded-full" style={{ background: "var(--danger)" }} />
      )}
    </Link>
  );
}
