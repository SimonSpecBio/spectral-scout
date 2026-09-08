import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";

// Answers "what's actually deployed right now" without needing shell
// access to the Vercel project -- came up repeatedly this pass (multiple
// AI reviewers unable to confirm production was running the commit they
// were told it was). VERCEL_GIT_COMMIT_SHA is populated automatically by
// Vercel's build system; no env var to set by hand, nothing to keep in
// sync manually.
//
// Actually touches the database (Phase 0.2a, build-cycle doc 2026-09-07)
// -- this used to return 200 unconditionally from process.env alone, so it
// reported healthy even while the app was fully down (DB unreachable,
// pool exhausted, etc). A real SELECT 1 is the cheapest query that proves
// the app can actually read from Postgres, not just that the process is
// running.
export async function GET() {
  const commit = process.env.VERCEL_GIT_COMMIT_SHA ?? null;
  const deployedAt = commit ? null : "local dev, no commit SHA available";
  try {
    await db.execute(sql`select 1`);
    return NextResponse.json({ ok: true, commit, deployedAt });
  } catch (err) {
    return NextResponse.json(
      { ok: false, commit, deployedAt, error: err instanceof Error ? err.message : "database check failed" },
      { status: 503 }
    );
  }
}
