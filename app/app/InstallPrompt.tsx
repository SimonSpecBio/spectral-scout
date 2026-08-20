"use client";

import { useEffect, useState } from "react";
import { hasEngaged } from "@/lib/pwa-engagement";
import { useToastStackPosition } from "@/lib/toast-stack";

const DISMISS_KEY = "spectral-install-dismissed";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(display-mode: standalone)").matches || (window.navigator as unknown as { standalone?: boolean }).standalone === true;
}
function isIOS(): boolean {
  return typeof navigator !== "undefined" && /iPad|iPhone|iPod/.test(navigator.userAgent);
}

// Install-prompt UX (INSTALL_PWA.md ยง5) -- quiet, well-timed: only after
// the user has actually done something (lib/pwa-engagement.ts), never on
// landing, never if already installed, and never again for a while after
// a dismissal. Android/Chromium gets a custom button firing the stashed
// beforeinstallprompt event; iOS Safari has no programmatic prompt, so it
// gets a one-time "tap Share -> Add to Home Screen" coaching sheet instead.
export default function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIosTip, setShowIosTip] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (isStandalone()) return;
    let dismissed = false;
    try {
      dismissed = localStorage.getItem(DISMISS_KEY) === "1";
    } catch {
      /* ignore */
    }
    if (dismissed || !hasEngaged()) return;

    if (isIOS()) {
      setShowIosTip(true);
      setVisible(true);
      return;
    }

    function onBeforeInstallPrompt(e: Event) {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setVisible(true);
    }
    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
  }, []);

  function dismiss() {
    setVisible(false);
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* ignore */
    }
  }

  async function install() {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    dismiss();
  }

  const stackPosition = useToastStackPosition("bottom", "install-prompt", visible);

  if (!visible) return null;

  return (
    <div
      className="fixed inset-x-4 bottom-24 z-40 mx-auto flex max-w-sm items-center gap-3 rounded-xl p-3.5 lg:bottom-6"
      style={{
        background: "var(--surface-raised)",
        border: "0.5px solid var(--border-soft)",
        transform: stackPosition > 0 ? `translateY(-${stackPosition * 4.5}rem)` : undefined,
      }}
    >
      {showIosTip ? (
        <div className="flex-1 text-xs text-[var(--text-dim)]">
          Add Spectral to your home screen — tap <span className="text-[var(--text)]">Share ↗</span> then{" "}
          <span className="text-[var(--text)]">&ldquo;Add to Home Screen&rdquo;</span>.
        </div>
      ) : (
        <div className="flex-1 text-sm">Install Spectral for offline access and a home-screen icon.</div>
      )}
      {!showIosTip && (
        <button onClick={install} className="shrink-0 rounded-md bg-[var(--accent)] px-3 py-1.5 text-xs font-medium text-[var(--on-accent)]">
          Install
        </button>
      )}
      <button onClick={dismiss} aria-label="Dismiss" className="shrink-0 text-[var(--text-faint)]">
        ×
      </button>
    </div>
  );
}
