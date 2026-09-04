import { and, eq, lt } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { pestEvents, tasks } from "@/db/schema";

// Deliberate follow-up to the P0 dedup fix (rechGkdQRL6oBV6kY, "nine
// duplicate recheck tasks"): that fix stopped NEW duplicates, but did
// nothing about auto-created recheck tasks that are already long dead.
// A hotspot-monitoring follow-up 14+ days overdue isn't a to-do any more --
// it's noise on the schedule and it inflates the overdue counts, pushing
// real work down the list. Scoped narrowly to auto-created "monitor" tasks
// (the exact class the dedup bug produced), not every task type -- a
// manually-created task a grower is genuinely behind on should keep
// nagging them, not get silently swept away by a cron they didn't ask for.
//
// Snooze vs. auto-close is picked per case (Simon's own framing), not one
// blanket rule: a task whose linked pest event is still ACTIVE gets
// snoozed (status the grower can already see and undo via Unsnooze --
// TaskDetailClient.tsx -- since the underlying hotspot might still need a
// recheck); a task with no linked event, or whose event has since
// resolved, gets auto-closed instead, with a "(auto-closed, Nd overdue)"
// title suffix -- the exact same "append days-late to the title" trick the
// monitoring route's auto-complete-on-log already uses, so Logs/Timeline
// (which just render a task's title) surface it visibly instead of a
// silent status flip nobody would ever notice.
const DAY_MS = 86_400_000;
const STALE_AFTER_DAYS = 14;

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const staleSince = new Date(now.getTime() - STALE_AFTER_DAYS * DAY_MS);
  const candidates = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.status, "open"), eq(tasks.type, "monitor"), eq(tasks.source, "auto_trigger"), lt(tasks.dueAt, staleSince)));

  let snoozed = 0;
  let closed = 0;
  for (const t of candidates) {
    const linkedEvent = t.pestEventId
      ? (await db.select({ status: pestEvents.status }).from(pestEvents).where(eq(pestEvents.id, t.pestEventId)))[0]
      : null;

    if (linkedEvent?.status === "active") {
      await db.update(tasks).set({ status: "snoozed" }).where(eq(tasks.id, t.id));
      snoozed++;
    } else {
      const daysLate = Math.floor((now.getTime() - t.dueAt.getTime()) / DAY_MS);
      await db
        .update(tasks)
        .set({ status: "done", completedAt: now, title: `${t.title} (auto-closed, ${daysLate}d overdue)` })
        .where(eq(tasks.id, t.id));
      closed++;
    }
  }

  return NextResponse.json({ ok: true, snoozed, closed });
}
