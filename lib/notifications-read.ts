// Client-only localStorage read-state, shared by NotificationsClient.tsx
// (the full list) and NotificationBell.tsx (just the unread dot) so they
// can never drift onto two different keys. lib/notifications.ts's own
// comment explains why this stays client-only: there's no server-side
// "when did this become true" timestamp to anchor read-state to, since
// computeNotifications() derives everything live rather than storing it.
const READ_KEY = "spectral-notifications-read";

export function loadRead(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(READ_KEY) ?? "[]"));
  } catch {
    return new Set();
  }
}

export function saveRead(read: Set<string>) {
  try {
    localStorage.setItem(READ_KEY, JSON.stringify([...read]));
  } catch {
    /* ignore */
  }
}
