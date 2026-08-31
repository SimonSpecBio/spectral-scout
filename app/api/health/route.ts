import { NextResponse } from "next/server";

// Answers "what's actually deployed right now" without needing shell
// access to the Vercel project -- came up repeatedly this pass (multiple
// AI reviewers unable to confirm production was running the commit they
// were told it was). VERCEL_GIT_COMMIT_SHA is populated automatically by
// Vercel's build system; no env var to set by hand, nothing to keep in
// sync manually.
export async function GET() {
  return NextResponse.json({
    commit: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
    deployedAt: process.env.VERCEL_GIT_COMMIT_SHA ? null : "local dev, no commit SHA available",
  });
}
