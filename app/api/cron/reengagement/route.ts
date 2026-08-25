import { eq, inArray, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/auth-schema";
import { facilities, facilityAreas, memberships, scoutingObservations } from "@/db/schema";
import { sendEmail } from "@/lib/email";
import { sendPushToUser } from "@/lib/push";

// Daily re-engagement nudge (ticket 91) -- applies to every account, not
// just home growers (Simon's explicit correction on the ticket: "applies to
// all accounts, not home-grower-only"). Runs once/day via vercel.json's
// cron entry. Vercel automatically sends `Authorization: Bearer
// $CRON_SECRET` on cron-triggered requests when that env var is set, which
// is also proxy.ts's documented convention for this exact path
// ("/api/cron/* authenticates via a bearer secret instead of a session").
const DAY_MS = 86_400_000;
// Simon's own suggested copy in the ticket ("You haven't scouted in 10
// days") -- using that number as the real threshold rather than picking a
// different one from the ticket's "10-14" range.
const INACTIVITY_THRESHOLD_DAYS = 10;

// VERCEL_PROJECT_PRODUCTION_URL is Vercel's own env var for this project's
// stable production domain (no scheme, no per-deploy hash) -- more reliable
// than guessing a custom domain that may not be attached yet.
function appUrl(): string {
  return process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000";
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const allFacilities = await db.select().from(facilities);

  // Last scouted per facility -- max(scoutingObservations.createdAt) rolled
  // up across every area that facility has, since the ticket's own copy
  // talks about a facility going quiet, not one specific area.
  const lastScoutedRows = await db
    .select({ facilityId: facilityAreas.facilityId, lastScoutedAt: sql<string>`max(${scoutingObservations.createdAt})` })
    .from(scoutingObservations)
    .innerJoin(facilityAreas, eq(scoutingObservations.facilityAreaId, facilityAreas.id))
    .groupBy(facilityAreas.facilityId);
  const lastScoutedByFacility = new Map(lastScoutedRows.map((r) => [r.facilityId, r.lastScoutedAt ? new Date(r.lastScoutedAt) : null]));

  let facilitiesNudged = 0;
  for (const facility of allFacilities) {
    // Never scouted at all: use the facility's own creation date as the
    // reference point instead, so a facility isn't nudged the same day it's
    // created before anyone's had a chance to scout it.
    const referenceDate = lastScoutedByFacility.get(facility.id) ?? facility.createdAt;
    const daysSince = (now.getTime() - referenceDate.getTime()) / DAY_MS;
    if (daysSince < INACTIVITY_THRESHOLD_DAYS) continue;
    // Already nudged for this same quiet period -- only re-eligible once a
    // fresh scouting observation moves referenceDate forward past the last
    // nudge, which is what "resets" this facility to eligible again.
    if (facility.lastNudgedAt && facility.lastNudgedAt >= referenceDate) continue;

    const members = await db.select().from(memberships).where(eq(memberships.organizationId, facility.organizationId));
    const memberUsers = members.length ? await db.select().from(users).where(inArray(users.id, members.map((m) => m.userId))) : [];
    const days = Math.floor(daysSince);
    const title = "Time to go scout";
    const body = `${facility.name} hasn't been scouted in ${days} days.`;
    await Promise.all([
      ...members.map((m) => sendPushToUser(m.userId, { title, body, url: `/app/facilities/${facility.id}` })),
      // Email alongside push, not instead of it -- push needs an explicit
      // opt-in toggle in Settings that most people will never find, while
      // magic-link sign-in already proves this app's email delivery
      // (auth.ts's Nodemailer provider, real Resend SMTP in production) is
      // a channel every grower already receives from. An earlier version of
      // this ticket wrongly assumed EMAIL_SERVER/EMAIL_FROM were dev-only
      // placeholders (true of .env.local, not of the real Vercel env) and
      // shipped push-only on that mistaken basis.
      ...memberUsers
        .filter((u) => u.email)
        .map((u) =>
          sendEmail({ to: u.email!, subject: title, text: `${body}\n\nOpen Spectral Scout: ${appUrl()}/app/facilities/${facility.id}` }).catch(() => {
            // Best-effort, same spirit as sendPushToUser's own per-subscription catch -- one bad address shouldn't block the rest of this run.
          })
        ),
    ]);
    await db.update(facilities).set({ lastNudgedAt: now }).where(eq(facilities.id, facility.id));
    facilitiesNudged++;
  }

  return NextResponse.json({ ok: true, facilitiesNudged });
}
