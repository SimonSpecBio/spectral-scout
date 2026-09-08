"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

// Route-segment error boundary (Phase 0.2a, build-cycle doc 2026-09-07) --
// before this existed, an uncaught render/data error anywhere under a
// route showed Next's raw, unbranded error screen with no way back except
// the browser's own back button. Reports to Sentry itself rather than
// relying on instrumentation.ts's server-side hook, since a client-render
// error never reaches the server at all.
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-6 px-7 py-16 text-center">
      <img src="/spectral-biocontrol-wordmark.png" alt="Spectral Biocontrol" width={600} height={170} className="h-11 w-auto" />
      <div className="flex flex-col items-center gap-2">
        <h1 className="text-2xl font-semibold">Something went wrong</h1>
        <p className="text-sm text-[var(--text-dim)]">
          This page hit an error. It&rsquo;s been reported -- try again, or head back home.
        </p>
      </div>
      <div className="flex w-full flex-col gap-2">
        <button
          onClick={reset}
          className="w-full rounded-md bg-[var(--accent)] px-5 py-3.5 text-sm font-medium text-[var(--on-accent)]"
        >
          Try again
        </button>
        <a
          href="/app"
          className="w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-5 py-3.5 text-center text-sm font-medium text-[var(--text)]"
        >
          Back to home
        </a>
      </div>
    </main>
  );
}
