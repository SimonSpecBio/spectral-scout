"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

// Root-layout error boundary (Phase 0.2a, build-cycle doc 2026-09-07) --
// catches an error in app/layout.tsx itself, which app/error.tsx can't
// (a segment's error boundary doesn't cover its own parent layout). Must
// render its own <html>/<body> since it replaces the entire root layout
// when it fires, per Next's own documented contract for this file. Kept
// deliberately plain (no Tailwind/globals.css dependency, no wordmark
// fetch) -- if the root layout itself is broken, this is the one page in
// the app that has to render even when nothing else can be trusted to.
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif", background: "#F6F4F0", color: "#1c2431" }}>
        <main
          style={{
            display: "flex",
            minHeight: "100vh",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 24,
            padding: "4rem 1.75rem",
            textAlign: "center",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "center" }}>
            <h1 style={{ fontSize: 24, fontWeight: 600, margin: 0 }}>Spectral Scout hit a problem</h1>
            <p style={{ fontSize: 14, color: "#5b6472", margin: 0, maxWidth: 360 }}>
              Something broke at the app level. It&rsquo;s been reported -- try reloading.
            </p>
          </div>
          <button
            onClick={reset}
            style={{
              borderRadius: 6,
              background: "#1c2431",
              color: "#fff",
              padding: "0.875rem 1.25rem",
              fontSize: 14,
              fontWeight: 500,
              border: "none",
              cursor: "pointer",
            }}
          >
            Reload
          </button>
        </main>
      </body>
    </html>
  );
}
