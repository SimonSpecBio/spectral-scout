"use client";

import { signOutAction } from "@/lib/auth-actions";

// Shared by every sign-out link (HeaderMenu, Sidebar, staff layout) so the
// cache-clearing step below only lives in one place. Plain onClick calling
// the server action directly, not a <form action> -- a Next.js server
// action is just an async function and can be invoked from a client event
// handler the same way, which is what lets this run browser-only cleanup
// FIRST and await it before the actual sign-out navigation happens.
//
// Clears Cache Storage (the service worker's navigation/API response
// cache) only -- never IndexedDB, which is where the OFFLINE CAPTURE QUEUE
// lives (lib/offline-queue.ts). Wiping that on sign-out would destroy
// real, not-yet-synced field data, exactly the class of bug this session
// already fixed once (ticket recAAWHkGTiiWDH5C). The two are easy to
// conflate since both are "browser storage," which is why this comment is
// explicit about only ever touching one of them.
//
// Ticket recmnUcdRHPF6nrPz: a shared greenhouse tablet is a normal
// deployment for this product, and the service worker's cache was keyed
// only on URL with nothing clearing it on sign-out -- user B signing in
// after user A signed out could be served user A's cached dashboard HTML
// or API JSON on any network hiccup, before a single real request ever
// completed for user B.
async function clearResponseCaches() {
  if (typeof caches === "undefined") return;
  try {
    const keys = await caches.keys();
    await Promise.all(keys.map((key) => caches.delete(key)));
  } catch {
    // Cache Storage can throw in a locked-down/private-browsing context --
    // sign-out must still proceed either way, so this is swallowed rather
    // than blocking the actual sign-out on a best-effort cleanup step.
  }
}

export default function SignOutButton({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={async () => {
        await clearResponseCaches();
        await signOutAction();
      }}
      className={className}
    >
      {children}
    </button>
  );
}
