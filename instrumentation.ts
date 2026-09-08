import * as Sentry from "@sentry/nextjs";

// Boot-time env var validation (Phase 0.2a, build-cycle doc 2026-09-07) --
// this runs once per server/edge cold start, before any request is served,
// so a misconfigured deploy shows up here instead of failing silently mid-
// request the first time a grower hits the affected path. Deliberately
// warns rather than throws: a missing optional integration (Google OAuth,
// email, blob storage) degrades that one feature, not the whole app, and
// crashing boot over it would be strictly worse than what it replaces.
const REQUIRED_ALWAYS = ["DATABASE_URL", "AUTH_SECRET"] as const;
const REQUIRED_FOR_FEATURES: Record<string, readonly string[]> = {
  "scheduled jobs (cron routes fail closed without this)": ["CRON_SECRET"],
  "push notifications": ["VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY", "NEXT_PUBLIC_VAPID_PUBLIC_KEY"],
  "error tracking": ["SENTRY_DSN", "NEXT_PUBLIC_SENTRY_DSN"],
};

function checkEnv() {
  const missingCore = REQUIRED_ALWAYS.filter((k) => !process.env[k]);
  if (missingCore.length > 0) {
    console.error(`[boot] Missing required env var(s): ${missingCore.join(", ")} -- the app cannot function correctly without these.`);
  }
  for (const [feature, keys] of Object.entries(REQUIRED_FOR_FEATURES)) {
    const missing = keys.filter((k) => !process.env[k]);
    if (missing.length > 0) {
      console.error(`[boot] Missing env var(s) for ${feature}: ${missing.join(", ")}`);
    }
  }
}

export async function register() {
  checkEnv();
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

// Automatically captures unhandled server-side request errors (route
// handlers, server actions, RSC render) without needing a try/catch at
// every call site.
export const onRequestError = Sentry.captureRequestError;
