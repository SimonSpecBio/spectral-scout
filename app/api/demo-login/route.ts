import crypto from "crypto";
import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { sessions, users } from "@/db/auth-schema";
import { memberships, organizations } from "@/db/schema";
import { CURRENT_CONSENT_VERSION } from "@/lib/consent";

const DEMO_EMAIL = "demo@spectralscout.app";
const SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // matches NextAuth's database-session default

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

// One shared, always-onboarded account anyone can click straight into --
// Simon's explicit call (2026-08-30): a single test account, shared data,
// no per-visitor isolation. Pre-fills state/consent so proxy.ts's
// onboarding gate never fires for it. Idempotent find-or-create (same
// transaction + retry-on-unique-violation shape as auth.ts's
// provisionMembership) since this route, unlike normal sign-in, is
// designed to be hit concurrently by multiple people/agents at once,
// including the very first request that has to create the row.
async function ensureDemoUser() {
  const [existing] = await db.select().from(users).where(eq(users.email, DEMO_EMAIL));
  if (existing) return existing;

  try {
    return await db.transaction(async (tx) => {
      let [user] = await tx.select().from(users).where(eq(users.email, DEMO_EMAIL));
      if (!user) {
        [user] = await tx.insert(users).values({ email: DEMO_EMAIL, name: "Test Account", emailVerified: new Date() }).returning();
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
      const [user] = await db.select().from(users).where(eq(users.email, DEMO_EMAIL));
      return user;
    }
    throw err;
  }
}

async function handleDemoLogin(request: NextRequest): Promise<NextResponse> {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (!checkDemoLoginRateLimit(ip)) {
    return NextResponse.json({ error: "Too many attempts. Try again in a few minutes." }, { status: 429 });
  }

  const user = await ensureDemoUser();
  const sessionToken = crypto.randomBytes(32).toString("hex");
  await db.insert(sessions).values({ sessionToken, userId: user.id, expires: new Date(Date.now() + SESSION_MAX_AGE_MS) });

  const isHttps = request.nextUrl.protocol === "https:";
  const response = NextResponse.redirect(new URL("/app", request.nextUrl.origin));
  response.cookies.set(isHttps ? "__Secure-authjs.session-token" : "authjs.session-token", sessionToken, {
    httpOnly: true,
    secure: isHttps,
    sameSite: "lax",
    path: "/",
    expires: new Date(Date.now() + SESSION_MAX_AGE_MS),
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
