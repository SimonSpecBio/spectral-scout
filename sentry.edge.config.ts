import * as Sentry from "@sentry/nextjs";

// Same as sentry.server.config.ts, for the Edge runtime (proxy.ts's
// middleware) -- no Node APIs available there, so no includeLocalVariables.
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  release: process.env.VERCEL_GIT_COMMIT_SHA,
  environment: process.env.VERCEL_ENV ?? "development",
  tracesSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.1,
});
