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

  // Fully sequential across every org, with 4 more sequential alert
  // computations inside each one, made this O(orgs x 4-ish round-trip
  // chains) and fully serial -- at a few hundred orgs this risks exceeding
  // the Vercel function timeout and failing the whole run silently
  // (Airtable ticket rec5XjxiiN0UNKI65). Two independent fixes below: the 4
  // alert computations per org don't depend on each other, so they run in
  // parallel; and orgs are processed in small concurrent batches rather
  // than one-at-a-time or all-at-once (hundreds of orgs firing every query
  // at once would just move the bottleneck to the DB connection pool).
  async function processOrgAlerts(organizationId: string): Promise<number> {
    const candidates: { alertKey: string; title: string; body: string; url: string }[] = [];

    const [trapAlertsRaw, scoutingAlerts, monitoringAlerts, escalationAlerts] = await Promise.all([
      computeTrapAlerts(organizationId),
      computeScoutingAlerts(organizationId),
      computeMonitoringAlerts(organizationId),
      computeEscalationAlerts(organizationId),
    ]);

    const trapAlerts = trapAlertsRaw.filter((a) => !a.dedupedIntoEventId);
    for (const a of trapAlerts) {
      candidates.push({
        alertKey: `trap-${a.trapId}`,
        title: `${a.trapLabel} spike`,
        body: `${a.catchPerDay.toFixed(1)}/day ${displayNameForPestSpecies(a.pestSpecies)} -- confirm?`,
        url: `/app/traps?facility=${a.facilityId}`,
      });
    }
    for (const a of scoutingAlerts) {
      candidates.push({
        alertKey: `scouting-${a.observationId}`,
        title: "Scouting log over threshold",
        body: `${metricLabel({ kind: a.metricKind, value: a.value })} -- confirm?`,
        url: scoutingAlertConfirmHref(a),
      });
    }
    for (const a of monitoringAlerts) {
      const severityOnly = a.crossed.length === 1 && a.crossed[0] === "severity";
      candidates.push({
        alertKey: `threshold-${a.eventId}`,
        title: `${displayNameForPestSpecies(a.pestSpecies)} ${severityOnly ? "severity" : ""} over threshold`.replace("  ", " "),
        body: metricLabel({ kind: a.metricKind, value: a.value, severityPct: a.severityValue }),
        url: `/app/facilities/${a.facilityId}/pest-events/${a.eventId}`,
      });
    }
    for (const a of escalationAlerts) {
      candidates.push({
        alertKey: `escalation-${a.eventId}`,
        title: `${displayNameForPestSpecies(a.pestSpecies)} not improving`,
        body: "Try a different tier?",
        url: `/app/facilities/${a.facilityId}/pest-events/${a.eventId}?tab=recommended`,
      });
    }

    if (candidates.length === 0) return 0;

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
    if (fresh.length === 0) return 0;

    const members = await db.select().from(memberships).where(eq(memberships.organizationId, organizationId));
    let orgPushed = 0;
    for (const alert of fresh) {
      await Promise.all(members.map((m) => sendPushToUser(m.userId, { title: alert.title, body: alert.body, url: alert.url })));
      await db.insert(pushAlertsSent).values({ alertKey: alert.alertKey, organizationId });
      orgPushed++;
    }
    return orgPushed;
  }

  const orgs = await db.select().from(organizations);
  let pushed = 0;
  const ORG_BATCH_SIZE = 10;
  for (let i = 0; i < orgs.length; i += ORG_BATCH_SIZE) {
    const batch = orgs.slice(i, i + ORG_BATCH_SIZE);
    const batchPushCounts = await Promise.all(batch.map((org) => processOrgAlerts(org.id)));
    pushed += batchPushCounts.reduce((sum, n) => sum + n, 0);
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
