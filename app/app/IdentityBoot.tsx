"use client";

import { useEffect, useState } from "react";
import { setActiveIdentity } from "@/lib/client-identity";

// Publishes the server-resolved signed-in user id to the client-side identity
// module (Task 763), so the offline queue and draft storage can namespace
// browser-local data by owner. Rendered high in the /app layout, before any
// capture form, and set via a lazy useState initializer so it runs
// synchronously during this component's first render -- ahead of a child
// form's render-time draft read, which must already see the correct owner
// rather than the "anon" fallback. The effect keeps it in sync on account
// switch and clears it on unmount (leaving /app, e.g. sign-out).
export default function IdentityBoot({ userId }: { userId?: string | null }) {
  useState(() => {
    setActiveIdentity(userId ?? null);
    return null;
  });
  useEffect(() => {
    setActiveIdentity(userId ?? null);
    return () => setActiveIdentity(null);
  }, [userId]);
  return null;
}
