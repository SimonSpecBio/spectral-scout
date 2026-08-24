"use client";

import { useEffect, useState } from "react";

// Web Push opt-in (ticket 91) -- powers the daily re-engagement nudge
// ("You haven't scouted in 10 days") plus, going forward, any other
// out-of-band alert worth reaching a grower who isn't currently looking at
// the app. Entirely browser-permission-driven: there's no server-side
// "enabled" flag, just whether a live subscription row exists for this
// device (db/schema.ts's scout_push_subscription).
type Status = "unsupported" | "checking" | "denied" | "off" | "on" | "working";

function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const base64Safe = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64Safe);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export default function NotificationsToggle() {
  const [status, setStatus] = useState<Status>("checking");

  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window)) {
      setStatus("unsupported");
      return;
    }
    if (Notification.permission === "denied") {
      setStatus("denied");
      return;
    }
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => setStatus(sub ? "on" : "off"))
      .catch(() => setStatus("off"));
  }, []);

  async function enable() {
    setStatus("working");
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setStatus(permission === "denied" ? "denied" : "off");
        return;
      }
      const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!publicKey) throw new Error("missing VAPID public key");
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) });
      await fetch("/api/push/subscribe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(sub.toJSON()) });
      setStatus("on");
    } catch {
      setStatus("off");
    }
  }

  async function disable() {
    setStatus("working");
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push/subscribe", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: sub.endpoint }) });
        await sub.unsubscribe();
      }
      setStatus("off");
    } catch {
      setStatus("on");
    }
  }

  if (status === "unsupported") return null;

  return (
    <div className="card flex items-center justify-between p-4">
      <div>
        <div className="text-sm font-medium">Notifications</div>
        <div className="label-mono">
          {status === "denied" ? "Blocked in browser settings" : status === "on" ? "On" : status === "working" ? "Working…" : "Off"}
        </div>
      </div>
      {status !== "denied" && (
        <button
          onClick={status === "on" ? disable : enable}
          disabled={status === "checking" || status === "working"}
          className="rounded-md border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--text-dim)] disabled:opacity-50"
        >
          {status === "on" ? "Turn off" : "Turn on"}
        </button>
      )}
    </div>
  );
}
