import * as Sentry from "@sentry/nextjs";

// Client/browser runtime init -- Next.js auto-loads this file (current
// SDK convention; older docs used sentry.client.config.ts). No Session
// Replay/Profiling/Logs here: this pass is scoped to error reporting +
// release tagging (Phase 0.2b, build-cycle doc 2026-09-07), not a full
// observability suite -- those carry their own privacy/consent
// considerations (session recording especially) that haven't been decided.
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? "development",
  tracesSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.1,
});

// Hook into App Router navigation transitions so a route change shows up
// as its own trace instead of every navigation being invisible to tracing.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
