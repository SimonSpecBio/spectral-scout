"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { NotificationKind } from "@/lib/notifications";

interface Notification {
  id: string;
  kind: NotificationKind;
  title: string;
  sub: string;
  at: string;
  href: string;
}

const KIND_COLOR: Record<NotificationKind, string> = {
  threshold: "#CE5D40",
  trap: "#CE5D40",
  scouting: "#CE5D40",
  lowstock: "#CE5D40",
  task_overdue: "#CE5D40",
  task_assigned: "#8FA2BD",
  rei_cleared: "#4E9E86",
  order_placed: "#8FA2BD",
};

const READ_KEY = "spectral-notifications-read";

function loadRead(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(READ_KEY) ?? "[]"));
  } catch {
    return new Set();
  }
}
function saveRead(read: Set<string>) {
  try {
    localStorage.setItem(READ_KEY, JSON.stringify([...read]));
  } catch {
    /* ignore */
  }
}

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const hours = Math.floor(ms / 3_600_000);
  if (hours < 1) return "now";
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

export default function NotificationsClient({ notifications }: { notifications: Notification[] }) {
  const [read, setRead] = useState<Set<string>>(new Set());

  useEffect(() => {
    setRead(loadRead());
  }, []);

  function markAllRead() {
    const next = new Set(notifications.map((n) => n.id));
    setRead(next);
    saveRead(next);
  }

  function markRead(id: string) {
    setRead((prev) => {
      const next = new Set(prev).add(id);
      saveRead(next);
      return next;
    });
  }

  const now = new Date();
  const isToday = (iso: string) => {
    const d = new Date(iso);
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
  };
  const today = notifications.filter((n) => isToday(n.at));
  const earlier = notifications.filter((n) => !isToday(n.at));

  function renderGroup(label: string, items: Notification[]) {
    if (items.length === 0) return null;
    return (
      <div className="flex flex-col gap-2">
        <span className="label-mono">{label}</span>
        <div className="card flex flex-col divide-y divide-[var(--border)]">
          {items.map((n) => {
            const isRead = read.has(n.id);
            return (
              <Link key={n.id} href={n.href} onClick={() => markRead(n.id)} className="flex items-center gap-3 p-3.5">
                {!isRead && <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: KIND_COLOR[n.kind] }} />}
                {isRead && <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: "transparent" }} />}
                <div className="flex-1">
                  <div className="text-sm" style={{ color: isRead ? "var(--text-dim)" : "var(--text)" }}>
                    {n.title}
                  </div>
                  <div className="label-mono">{n.sub}</div>
                </div>
                <span className="label-mono text-[var(--text-faint)]">{relativeTime(n.at)}</span>
              </Link>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Notifications</h1>
        <button onClick={markAllRead} className="text-sm text-[var(--accent)]">
          Mark read
        </button>
      </div>
      {notifications.length === 0 ? (
        <div className="card p-6 text-sm text-[var(--text-dim)]">Nothing to see here.</div>
      ) : (
        <>
          {renderGroup("Today", today)}
          {renderGroup("Earlier", earlier)}
        </>
      )}
    </>
  );
}
