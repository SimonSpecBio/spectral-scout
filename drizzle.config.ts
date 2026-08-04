import { existsSync } from "node:fs";
import { defineConfig } from "drizzle-kit";

// drizzle-kit is a plain Node CLI, not Next.js, so it doesn't auto-load
// .env.local the way `next dev`/`next build` do. Load it explicitly.
if (existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

export default defineConfig({
  out: "./drizzle",
  schema: ["./db/schema.ts", "./db/auth-schema.ts"],
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  // Same shared Postgres instance as spectral-ops/spectral-pilot/spectral-rnd
  // (see db/index.ts). A dedicated migrations table keeps this app's
  // migration history independent -- see spectral-pilot/drizzle.config.ts
  // for the incident that made this mandatory, not optional.
  migrations: {
    table: "__scout_drizzle_migrations",
    schema: "public",
  },
});
