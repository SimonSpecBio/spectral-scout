import { eq, inArray, lt } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { memberships, organizations, pushAlertsSent } from "@/db/schema";
import { sendPushToUser } from "@/lib/push";
import { computeScoutingAlerts, scoutingAlertConfirmHref } from "@/lib/scouting-alerts";
import { computeEscalationAlerts, computeMonitoringAlerts, metricLabel } from "@/lib/threshold-engine";
import { computeTrapAlerts } from "@/lib/trap-alerts";
import { displayNameForPestSpecies } from "@/lib/treatments-catalog";

// "Important things" push (Simon's direct instruction, 2026-09-03): the
// same trap-spike/scouting-threshold/event-threshold/escalation signals
// the in-app Notifications feed (lib/notifications.ts) already surfaces,
// but pushed to a phone instead of only showing up next time someone
// opens the app. Runs daily via vercel.json's cron entry, same schedule
// as reengagement/overdue-tasks -- NOT the sub-daily interval the ticket
// really wants for these to feel timely; Vercel's Hobby plan hard-rejects
// (build fails outright) any cron more frequent than once/day, which is
// what this project is currently on. Getting real timeliness needs either
// a Vercel Pro upgrade (unlocks minute-level cron) or a deeper change to
// check thresholds immediately when the underlying data is created
// (trap reading / scouting observation / monitoring session logged)
// instead of polling on a schedule at all -- a real product/infra choice,
// flagged back to Simon rather than picked unilaterally.
//
// Every one of these alerts is computed on demand from other tables, not
// a stored row of its own, so re-running this on a short interval would
// re-discover and re-push the exact same alert every single time without
// scout_push_alert_sent's dedup ledger. alertKey reuses lib/
// notifications.ts's exact per-kind id convention (those ids are real
// table primary keys, already globally unique -- no need to also scope by
// org in the key itself, org id is still stored on the row for reference/
// cleanup).
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const orgs = await db.select().from(organizations);
  let pushed = 0;

  for (const org of orgs) {
    const candidates: { alertKey: string; title: string; body: string; url: string }[] = [];

    const trapAlerts = (await computeTrapAlerts(org.id)).filter((a) => !a.dedupedIntoEventId);
    for (const a of trapAlerts) {
      candidates.push({
        alertKey: `trap-${a.trapId}`,
        title: `${a.trapLabel} spike`,
        body: `${a.catchPerDay.toFixed(1)}/day ${displayNameForPestSpecies(a.pestSpecies)} -- confirm?`,
        url: `/app/traps?facility=${a.facilityId}`,
      });
    }

    const scoutingAlerts = await computeScoutingAlerts(org.id);
    for (const a of scoutingAlerts) {
      candidates.push({
        alertKey: `scouting-${a.observationId}`,
        title: "Scouting log over threshold",
        body: `${metricLabel({ kind: a.metricKind, value: a.value })} -- confirm?`,
        url: scoutingAlertConfirmHref(a),
      });
    }

    const monitoringAlerts = await computeMonitoringAlerts(org.id);
    for (const a of monitoringAlerts) {
      candidates.push({
        alertKey: `threshold-${a.eventId}`,
        title: `${displayNameForPestSpecies(a.pestSpecies)} over threshold`,
        body: metricLabel({ kind: a.metricKind, value: a.value }),
        url: `/app/facilities/${a.facilityId}/pest-events/${a.eventId}`,
      });
    }

    const escalationAlerts = await computeEscalationAlerts(org.id);
    for (const a of escalationAlerts) {
      candidates.push({
        alertKey: `escalation-${a.eventId}`,
        title: `${displayNameForPestSpecies(a.pestSpecies)} not improving`,
        body: "Try a different tier?",
        url: `/app/facilities/${a.facilityId}/pest-events/${a.eventId}?tab=recommended`,
      });
    }

    if (candidates.length === 0) continue;

    const alreadySent = await db
      .select({ alertKey: pushAlertsSent.alertKey })
      .from(pushAlertsSent)
      .where(
        inArray(
          pushAlertsSent.alertKey,
          candidates.map((c) => c.alertKey)
        )
      );
    const sentKeys = new Set(alreadySent.map((r) => r.alertKey));
    const fresh = candidates.filter((c) => !sentKeys.has(c.alertKey));
    if (fresh.length === 0) continue;

    const members = await db.select().from(memberships).where(eq(memberships.organizationId, org.id));
    for (const alert of fresh) {
      await Promise.all(members.map((m) => sendPushToUser(m.userId, { title: alert.title, body: alert.body, url: alert.url })));
      await db.insert(pushAlertsSent).values({ alertKey: alert.alertKey, organizationId: org.id });
      pushed++;
    }
  }

  // scout_push_alert_sent only ever grows -- an alert's underlying row
  // (trap reading, observation, event) can itself be resolved/deleted long
  // after the alert fired, with nothing to trigger cleaning up its ledger
  // entry. Not worth a real foreign-key cascade for a table that's pure
  // bookkeeping; pruning anything older than the longest alert could
  // plausibly still be relevant (90 days, generous) keeps it bounded
  // without risking deleting a still-relevant dedup key.
  await db.delete(pushAlertsSent).where(lt(pushAlertsSent.sentAt, new Date(Date.now() - 90 * 86_400_000)));

  return NextResponse.json({ ok: true, pushed });
}
