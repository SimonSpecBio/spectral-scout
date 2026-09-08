import * as Sentry from "@sentry/nextjs";

// Phase 0.2b (build-cycle doc, 2026-09-07): the app previously had zero
// error tracking -- one console.error in the whole repo, ~38 catch blocks
// (verified during this pass: every one already has a real handler or an
// explanatory comment, so nothing to fix there). release is the deploy's
// own commit SHA (Vercel sets this automatically) so an error maps back to
// exactly what was live when it happened.
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  release: process.env.VERCEL_GIT_COMMIT_SHA,
  environment: process.env.VERCEL_ENV ?? "development",
  tracesSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.1,
  // Attach local variable values to stack frames -- server-only, no
  // browser equivalent.
  includeLocalVariables: true,
});
