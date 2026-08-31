"use client";

import { useEffect, useState } from "react";
import { isMutationInFlight, onMutationSettled } from "@/lib/offline-queue";
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

    // A controllerchange event fires the FIRST time this page ever gets a
    // controller at all (a brand-new visitor's just-installed worker
    // calling clients.claim()) just as much as it does when a NEWER worker
    // replaces an already-active one. Only the second case means the page
    // is running stale code that's worth reloading for -- the first case
    // has no old controller to be stale relative to, and reloading right
    // then raced with whatever navigation the visitor was already
    // mid-click on (root cause of the demo-login link intermittently
    // landing back on "/" instead of /app: the forced reload could fire in
    // the same instant as the click's own navigation, and depending on
    // exact timing either one could win the race).
    const hadControllerAtLoad = !!navigator.serviceWorker.controller;

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
    function doReload() {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    }
    function handleControllerChange() {
      if (!hadControllerAtLoad) return;
      if (refreshing) return;
      // Don't truncate an in-progress capture-form submission (queuedFetch)
      // just because a new service worker version claimed control in the
      // background -- wait for it to settle, then reload.
      if (!isMutationInFlight()) {
        doReload();
        return;
      }
      const unsubscribe = onMutationSettled(() => {
        if (isMutationInFlight()) return;
        unsubscribe();
        doReload();
      });
    }
    navigator.serviceWorker.addEventListener("controllerchange", handleControllerChange);

    return () => {
      reg = null;
      navigator.serviceWorker.removeEventListener("controllerchange", handleControllerChange);
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
