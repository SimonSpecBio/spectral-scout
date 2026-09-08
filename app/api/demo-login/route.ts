import crypto from "crypto";
import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { sessions, users } from "@/db/auth-schema";
import {
  facilities,
  facilityAreas,
  facilityMapObjects,
  memberships,
  organizations,
  pestEvents,
  scoutingObservations,
  tasks,
  treatments,
} from "@/db/schema";
import { CURRENT_CONSENT_VERSION } from "@/lib/consent";
import { DEMO_MANAGER_EMAIL, DEMO_QUERY_PARAM, DEMO_SCOUT_EMAIL, DEMO_SESSION_MAX_AGE_MS } from "@/lib/demo-account";
import { grid2d } from "@/lib/layout-presets";
import { assignCaseNumber } from "@/lib/pest-events";

// Best-effort, in-memory, per-IP -- same "doesn't survive a cold start,
// stops a scripted hammering loop" tradeoff as lib/rate-limit.ts's
// checkSignInRateLimit, just keyed by IP since this route (unlike sign-in)
// has no email to key on and is designed to be clickable with zero
// verification by anyone -- including the AI agents Simon wants poking at
// it, so the cap is generous, not a per-human assumption.
const WINDOW_MS = 15 * 60_000;
const MAX_ATTEMPTS = 30;
const hits = new Map<string, { count: number; windowStart: number }>();
function checkDemoLoginRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = hits.get(ip);
  if (!entry || now - entry.windowStart > WINDOW_MS) {
    hits.set(ip, { count: 1, windowStart: now });
    return true;
  }
  if (entry.count >= MAX_ATTEMPTS) return false;
  entry.count += 1;
  return true;
}

// Two real identities in the SAME shared org (Phase 0.75, build-cycle doc
// 2026-09-07), not a UI role switcher -- ensureDemoManager always runs
// first (creating the org if this is the very first demo visit ever,
// regardless of which link someone actually clicked) so ensureDemoScout
// always has a real org to join as a member of, never one of its own.
// Idempotent find-or-create (same transaction + retry-on-unique-violation
// shape as auth.ts's provisionMembership) since this route is designed to
// be hit concurrently by multiple people/agents at once, including the
// very first request that has to create the row.
async function ensureDemoManager() {
  const [existing] = await db.select().from(users).where(eq(users.email, DEMO_MANAGER_EMAIL));
  if (existing) return existing;

  try {
    return await db.transaction(async (tx) => {
      let [user] = await tx.select().from(users).where(eq(users.email, DEMO_MANAGER_EMAIL));
      if (!user) {
        [user] = await tx.insert(users).values({ email: DEMO_MANAGER_EMAIL, name: "Test Account", emailVerified: new Date() }).returning();
      }
      const [membership] = await tx.select().from(memberships).where(eq(memberships.userId, user.id));
      if (!membership) {
        const [org] = await tx
          .insert(organizations)
          .values({
            name: "Test Account",
            accountTier: "general",
            state: "CO",
            dataConsentVersion: CURRENT_CONSENT_VERSION,
            dataConsentAcceptedAt: new Date(),
            dataConsentAcceptedByUserId: user.id,
          })
          .returning();
        await tx.insert(memberships).values({ userId: user.id, organizationId: org.id, role: "owner" });
      }
      return user;
    });
  } catch (err) {
    if ((err as { code?: string }).code === "23505") {
      const [user] = await db.select().from(users).where(eq(users.email, DEMO_MANAGER_EMAIL));
      return user;
    }
    throw err;
  }
}

// A Scout (member) identity in the exact same org the manager already
// owns -- ensureDemoManager above guarantees that org exists before this
// ever runs. Before this, ensureDemoUser only ever created an owner, so
// the Scout home (Today's Tasks -> case -> action) was unreachable
// without a real customer org (the actual blocker Phase 1.3 named).
async function ensureDemoScout(organizationId: string) {
  const [existing] = await db.select().from(users).where(eq(users.email, DEMO_SCOUT_EMAIL));
  if (existing) return existing;

  try {
    return await db.transaction(async (tx) => {
      let [user] = await tx.select().from(users).where(eq(users.email, DEMO_SCOUT_EMAIL));
      if (!user) {
        [user] = await tx.insert(users).values({ email: DEMO_SCOUT_EMAIL, name: "Test Scout", emailVerified: new Date() }).returning();
      }
      const [membership] = await tx.select().from(memberships).where(eq(memberships.userId, user.id));
      if (!membership) {
        await tx.insert(memberships).values({ userId: user.id, organizationId, role: "member" });
      }
      return user;
    });
  } catch (err) {
    if ((err as { code?: string }).code === "23505") {
      const [user] = await db.select().from(users).where(eq(users.email, DEMO_SCOUT_EMAIL));
      return user;
    }
    throw err;
  }
}

// A demo org with no sites was a dead end -- the button correctly logged
// someone in, but landed on "No sites yet" with nothing to actually poke
// at (code review, 2026-08-31). Idempotent on "does the Steele ST fixture
// specifically exist," not just "does this org have any facility at all"
// -- checking for any facility meant this never re-ran once someone (a
// tester, another agent) created an unrelated second site in the demo
// org, and separately meant a schema/convention change (pestSpecies
// switching from commonName strings to catalog ids) silently left the
// original seed permanently stale since the function would never touch
// it again. Species stored as the catalog id directly ("pest_tssm" etc),
// same canonical form every event now stores (see resolveCanonicalPestId)
// -- findPestProgram/displayNameForPestSpecies both resolve an id, so
// these seeded events get real thresholds/recommendations and a proper
// display name exactly like a grower's own. Returns the facility/area ids
// either way (freshly created or already existing) so callers needing
// them (ensureDemoScoutTask) don't have to re-query.
async function ensureDemoFacility(organizationId: string, userId: string): Promise<{ facilityId: string; areaId: string }> {
  const [existingFacility] = await db
    .select()
    .from(facilities)
    .where(and(eq(facilities.organizationId, organizationId), eq(facilities.name, "Steele ST")));
  if (existingFacility) {
    const [area] = await db.select().from(facilityAreas).where(eq(facilityAreas.facilityId, existingFacility.id));
    return { facilityId: existingFacility.id, areaId: area.id };
  }

  return db.transaction(async (tx) => {
    const [alreadyThere] = await tx
      .select()
      .from(facilities)
      .where(and(eq(facilities.organizationId, organizationId), eq(facilities.name, "Steele ST")));
    if (alreadyThere) {
      const [area] = await tx.select().from(facilityAreas).where(eq(facilityAreas.facilityId, alreadyThere.id));
      return { facilityId: alreadyThere.id, areaId: area.id };
    }

    const [facility] = await tx.insert(facilities).values({ organizationId, name: "Steele ST" }).returning();
    const [area] = await tx
      .insert(facilityAreas)
      .values({ facilityId: facility.id, name: "Flower Room 1", kind: "flowering_room" })
      .returning();

    // Same grid2d preset LayoutPicker's "Row of benches" option generates,
    // so the seeded map looks exactly like what a real grower would have
    // drawn, not a placeholder.
    const zones = grid2d(2, 4, (r, c) => `Bench ${String.fromCharCode(65 + r)}${c + 1}`);
    const objects = await tx
      .insert(facilityMapObjects)
      .values(zones.map((z) => ({ facilityAreaId: area.id, shapeType: "rect" as const, geometry: z.geometry, label: z.label })))
      .returning();

    const [tssmEvent] = await tx
      .insert(pestEvents)
      .values({
        facilityId: facility.id,
        facilityAreaId: area.id,
        mapObjectId: objects[0].id,
        caseNumber: await assignCaseNumber(tx, organizationId),
        x: 99,
        y: 40,
        kind: "pest",
        pestSpecies: "pest_tssm",
        scientificName: "Tetranychus urticae",
        severity: "moderate",
        createdByUserId: userId,
      })
      .returning();
    await tx.insert(pestEvents).values({
      facilityId: facility.id,
      facilityAreaId: area.id,
      mapObjectId: objects[2].id,
      caseNumber: await assignCaseNumber(tx, organizationId),
      x: 99,
      y: 96,
      kind: "pest",
      pestSpecies: "pest_aphid",
      scientificName: "Myzus persicae / Phorodon cannabis",
      severity: "low",
      createdByUserId: userId,
    });
    await tx.insert(pestEvents).values({
      facilityId: facility.id,
      facilityAreaId: area.id,
      mapObjectId: objects[5].id,
      caseNumber: await assignCaseNumber(tx, organizationId),
      x: 223,
      y: 68,
      kind: "pathogen",
      pestSpecies: "path_pm",
      scientificName: "Golovinomyces / Podosphaera spp.",
      severity: "high",
      createdByUserId: userId,
    });

    // Three sessions, oldest first, a declining density trend -- gives the
    // infestation-over-time chart real (n>=3) data to draw instead of a
    // single point.
    const DAY_MS = 86_400_000;
    const today = new Date();
    const countsFor = [8, 6, 4];
    for (let i = 0; i < countsFor.length; i++) {
      const date = new Date(today.getTime() - (countsFor.length - 1 - i) * 3 * DAY_MS);
      await tx.insert(scoutingObservations).values({
        organizationId,
        facilityAreaId: area.id,
        x: 99,
        y: 40,
        submittedByUserId: userId,
        date: date.toISOString().slice(0, 10),
        assessmentType: "pest_count",
        sampleSize: 10,
        pestCount: countsFor[i],
        promotedPestEventId: tssmEvent.id,
      });
    }

    await tx.insert(treatments).values({
      facilityId: facility.id,
      pestEventId: tssmEvent.id,
      type: "biological",
      product: "Phytoseiulus persimilis",
      targetPest: "Two-spotted spider mites",
      operatorUserId: userId,
      minutesSpent: 15,
    });
    await tx.insert(treatments).values({
      facilityId: facility.id,
      pestEventId: tssmEvent.id,
      type: "spectral_light",
      product: "Spectral Pesticidal Light",
      targetPest: "Two-spotted spider mites",
      operatorUserId: userId,
      minutesSpent: 5,
    });

    return { facilityId: facility.id, areaId: area.id };
  });
}

// Gives the Scout demo something real to land on -- "tasks-first" means
// nothing if Today's Tasks is empty. Idempotent on title match (same
// convention as ensureDemoFacility's own "does the fixture specifically
// exist" check), so this only ever seeds once regardless of how many
// times the Scout demo link gets clicked.
async function ensureDemoScoutTask(organizationId: string, facilityId: string, areaId: string, scoutUserId: string) {
  const title = "Recheck spider mites, Bench A1";
  const [existing] = await db.select().from(tasks).where(and(eq(tasks.organizationId, organizationId), eq(tasks.title, title)));
  if (existing) return;

  await db.insert(tasks).values({
    organizationId,
    facilityId,
    facilityAreaId: areaId,
    type: "monitor",
    title,
    x: 99,
    y: 40,
    assigneeUserId: scoutUserId,
    createdByUserId: scoutUserId,
    source: "manual",
    dueAt: new Date(),
  });
}

async function handleDemoLogin(request: NextRequest): Promise<NextResponse> {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (!checkDemoLoginRateLimit(ip)) {
    return NextResponse.json({ error: "Too many attempts. Try again in a few minutes." }, { status: 429 });
  }

  // ensureDemoManager always runs first, whichever identity was actually
  // requested -- it's the one that can create the shared org from
  // scratch; ensureDemoScout only ever joins an org that's already there.
  const manager = await ensureDemoManager();
  const [managerMembership] = await db.select().from(memberships).where(eq(memberships.userId, manager.id));
  const { facilityId, areaId } = await ensureDemoFacility(managerMembership.organizationId, manager.id);

  const role = request.nextUrl.searchParams.get("role") === "scout" ? "scout" : "manager";
  let user = manager;
  if (role === "scout") {
    user = await ensureDemoScout(managerMembership.organizationId);
    await ensureDemoScoutTask(managerMembership.organizationId, facilityId, areaId, user.id);
  }

  const sessionToken = crypto.randomBytes(32).toString("hex");
  await db.insert(sessions).values({ sessionToken, userId: user.id, expires: new Date(Date.now() + DEMO_SESSION_MAX_AGE_MS) });

  // Both a real cookie (so a real browser's follow-up navigation to any
  // other /app page just keeps working) AND the token in the redirect's own
  // URL (so a stateless client -- one that follows a redirect but doesn't
  // carry Set-Cookie into the next request, which is how a lot of simple
  // AI-agent HTTP fetchers behave, unlike a real browser) still lands
  // authenticated on this one request with no cookie at all. proxy.ts
  // recognizes this query param directly against the sessions table.
  const target = new URL("/app", request.nextUrl.origin);
  target.searchParams.set(DEMO_QUERY_PARAM, sessionToken);
  const isHttps = request.nextUrl.protocol === "https:";
  const response = NextResponse.redirect(target);
  response.cookies.set(isHttps ? "__Secure-authjs.session-token" : "authjs.session-token", sessionToken, {
    httpOnly: true,
    secure: isHttps,
    sameSite: "lax",
    path: "/",
    expires: new Date(Date.now() + DEMO_SESSION_MAX_AGE_MS),
  });
  return response;
}

// GET, not just POST -- a plain <a href> (what a crawler/AI agent follows,
// as opposed to submitting a form) issues a GET. Both methods do the exact
// same thing; there's no state-changing distinction worth making here since
// the whole route accepts zero verification by design already.
export async function GET(request: NextRequest) {
  return handleDemoLogin(request);
}

export async function POST(request: NextRequest) {
  return handleDemoLogin(request);
}
