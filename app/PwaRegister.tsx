"use client";

import { useEffect, useState } from "react";
import { useToastStackPosition } from "@/lib/toast-stack";

// Registers the service worker (INSTALL_PWA.md ยง2) and surfaces the
// "Update available" toast (ยง6) when a new version has been fetched and is
// waiting to activate -- never a forced reload mid-task, just an
// unobtrusive tap-to-refresh. Mounted in the root layout (not the /app
// layout) so registration happens even for a signed-out visitor on the
// public landing page -- that's what an installability audit checks.
export default function PwaRegister() {
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    let reg: ServiceWorkerRegistration | null = null;

    navigator.serviceWorker.register("/sw.js").then((registration) => {
      reg = registration;

      if (registration.waiting && registration.active) {
        setWaitingWorker(registration.waiting);
      }
      registration.addEventListener("updatefound", () => {
        const installing = registration.installing;
        if (!installing) return;
        installing.addEventListener("statechange", () => {
          if (installing.state === "installed" && registration.active) {
            setWaitingWorker(installing);
          }
        });
      });
    });

    let refreshing = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    });

    return () => {
      reg = null;
    };
  }, []);

  function applyUpdate() {
    waitingWorker?.postMessage({ type: "SKIP_WAITING" });
    setWaitingWorker(null);
  }

  const stackPosition = useToastStackPosition("bottom", "pwa-update", !!waitingWorker);

  if (!waitingWorker) return null;

  return (
    <button
      onClick={applyUpdate}
      className="fixed inset-x-4 bottom-24 z-50 mx-auto flex max-w-xs items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm lg:bottom-6"
      style={{
        background: "var(--surface-raised)",
        border: "0.5px solid var(--border-soft)",
        color: "var(--text)",
        transform: stackPosition > 0 ? `translateY(-${stackPosition * 4.5}rem)` : undefined,
      }}
    >
      Update available — tap to refresh
    </button>
  );
}
