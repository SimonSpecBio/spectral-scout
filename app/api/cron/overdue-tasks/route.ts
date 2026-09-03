import { and, eq, lt } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { tasks } from "@/db/schema";
import { notifyTaskOverdue } from "@/lib/push";

// Escalating overdue-task push (Simon's direct instruction, 2026-09-03):
// "overdue tasks should ping every 24 hours after it's 24 hours late."
// Runs once/day via vercel.json's cron entry, same auth convention as
// /api/cron/reengagement (Vercel's own `Authorization: Bearer
// $CRON_SECRET` on cron-triggered requests).
const DAY_MS = 86_400_000;
// A daily cron only ever fires ~24h apart anyway -- this is just a safety
// margin against a same-day re-trigger (manual testing, a retried
// invocation) double-sending, not a real precision requirement.
const MIN_GAP_MS = 20 * 3_600_000;

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const overdueSince = new Date(now.getTime() - DAY_MS);
  const candidates = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.status, "open"), lt(tasks.dueAt, overdueSince)));

  let nudged = 0;
  for (const t of candidates) {
    if (!t.assigneeUserId) continue;
    if (t.lastOverdueNudgeAt && now.getTime() - t.lastOverdueNudgeAt.getTime() < MIN_GAP_MS) continue;

    const daysLate = Math.floor((now.getTime() - t.dueAt.getTime()) / DAY_MS);
    await notifyTaskOverdue(t, daysLate);
    await db.update(tasks).set({ lastOverdueNudgeAt: now }).where(eq(tasks.id, t.id));
    nudged++;
  }

  return NextResponse.json({ ok: true, nudged });
}
