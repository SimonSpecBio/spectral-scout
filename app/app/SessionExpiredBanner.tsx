"use client";

import { useEffect, useState } from "react";
import { onAuthRequired } from "@/lib/offline-queue";
import { useToastStackPosition } from "@/lib/toast-stack";

// A flush hitting 401/403 means the session itself expired while the queue
// sat there, not that any item was bad (ticket recAAWHkGTiiWDH5C's item 4)
// -- every item is left in the queue rather than dropped, and this prompts
// signing back in instead. flushQueue already re-runs on the existing
// online/visibility/pageshow listeners, so returning here after signing in
// picks the queue back up with no extra wiring needed.
export default function SessionExpiredBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => onAuthRequired(() => setVisible(true)), []);

  const stackPosition = useToastStackPosition("top", "session-expired", visible);

  if (!visible) return null;

  return (
    <div
      className="fixed inset-x-4 z-40 mx-auto flex max-w-xs flex-col items-center gap-2 rounded-2xl p-3 text-center text-xs"
      style={{
        top: "1rem",
        background: "var(--danger-bg)",
        border: "0.5px solid var(--danger)",
        color: "var(--danger)",
        transform: stackPosition > 0 ? `translateY(${stackPosition * 2.75}rem)` : undefined,
      }}
    >
      Your session expired. Sign in again to sync what&rsquo;s still pending.
      <a
        href={`/sign-in?callbackUrl=${encodeURIComponent(typeof window !== "undefined" ? window.location.pathname : "/app")}`}
        className="rounded-full px-3 py-1 font-medium"
        style={{ background: "var(--danger)", color: "var(--surface)" }}
      >
        Sign in
      </a>
    </div>
  );
}
