import webpush from "web-push";
import { db } from "@/db";
import { pushSubscriptions } from "@/db/schema";
import { taskActionHref } from "@/lib/tasks";

// Self-hosted Web Push (VAPID), alongside email (lib/email.ts) rather than
// instead of it -- ticket 91 needed SOME out-of-band channel to reach a
// grower who's inactive enough to not be looking at the app's own
// Notifications feed (lib/notifications.ts). Push needed no new paid
// account/API key (a self-generated key pair, the browser's own push
// service) but does need an explicit opt-in toggle in Settings most people
// will never find -- email is the higher-reach channel of the two (real
// Resend SMTP already live in production via auth.ts's magic-link sign-in),
// so both fire together rather than picking one.
let configured = false;
function ensureConfigured() {
  if (configured) return;
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) throw new Error("VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY are not set");
  webpush.setVapidDetails("mailto:support@spectralbiocontrol.com", publicKey, privateKey);
  configured = true;
}

export interface PushPayload {
  title: string;
  body: string;
  url: string;
}

// Sends to every subscription for one user, silently dropping any
// subscription the push service reports as gone (410/404 -- the browser
// permission was revoked or the device was reset) so dead rows don't pile
// up and don't get retried forever.
export async function sendPushToUser(userId: string, payload: PushPayload): Promise<void> {
  ensureConfigured();
  const { eq } = await import("drizzle-orm");
  const subs = await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.userId, userId));
  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify(payload)
        );
      } catch (err) {
        const statusCode = (err as { statusCode?: number }).statusCode;
        if (statusCode === 404 || statusCode === 410) {
          await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, sub.endpoint));
        }
        // Other errors (network blip, misconfigured VAPID) are swallowed per-subscription
        // so one bad row can't block the rest of the cron run's sends.
      }
    })
  );
}

// Push for "important things" (Simon's direct instruction, 2026-09-03):
// a new task assignment fires immediately from wherever tasks get created
// (manual assignment, reassignment, or any of the several server-side
// auto-trigger paths -- severe-hotspot recheck, keep-an-eye recheck,
// apply-program's follow-ups). One shared call site so every task-creation
// path gets this for free instead of each one remembering to wire it up
// separately. Always best-effort: a push failure (VAPID misconfigured,
// network blip, no subscription) must never fail the task-creation
// request that triggered it -- ensureConfigured() throws loudly on a real
// misconfiguration, which is exactly the kind of error a caller creating a
// task has no business seeing or being blocked by.
export async function notifyTaskAssigned(task: {
  id: string;
  title: string;
  type: string;
  facilityId: string | null;
  facilityAreaId: string | null;
  pestEventId: string | null;
  assigneeUserId: string | null;
}): Promise<void> {
  if (!task.assigneeUserId) return;
  try {
    await sendPushToUser(task.assigneeUserId, {
      title: "New task assigned",
      body: task.title,
      url: taskActionHref(task),
    });
  } catch {
    // best-effort, see comment above
  }
}

// The escalating overdue-task nudge half of "important things" (Simon's
// direct instruction, 2026-09-03: "overdue tasks should ping every 24
// hours after it's 24 hours late"). Called from the daily overdue-tasks
// cron for each task that's actually due a nudge right now -- the cron
// itself decides that using scout_task.lastOverdueNudgeAt, this function
// just sends the push and stamps it. Same best-effort contract as
// notifyTaskAssigned.
export async function notifyTaskOverdue(
  task: {
    id: string;
    title: string;
    type: string;
    facilityId: string | null;
    facilityAreaId: string | null;
    pestEventId: string | null;
    assigneeUserId: string | null;
  },
  daysLate: number
): Promise<void> {
  if (!task.assigneeUserId) return;
  try {
    await sendPushToUser(task.assigneeUserId, {
      title: `${task.title} is overdue`,
      body: `${daysLate} day${daysLate === 1 ? "" : "s"} late`,
      url: taskActionHref(task),
    });
  } catch {
    // best-effort, see notifyTaskAssigned's comment
  }
}
