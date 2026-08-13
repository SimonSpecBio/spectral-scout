// In-memory, best-effort -- Vercel Fluid Compute reuses warm instances
// (see the platform notes), so this catches sustained abuse hitting the
// same instance, but isn't a hard guarantee across concurrent
// cold-started instances/regions since there's no state shared between
// them. A distributed limiter (Upstash Redis, etc) would close that gap;
// this is the pragmatic first pass the ticket asked for, not a claim of
// bulletproof protection.
const WINDOW_MS = 15 * 60_000;
const MAX_ATTEMPTS = 3;

const hits = new Map<string, { count: number; windowStart: number }>();

// Per-email only -- the checkpoint this is called from (auth.ts's signIn
// callback, on email?.verificationRequest) doesn't have access to the
// raw request, so there's no clean way to also key on IP without moving
// this into middleware and taking on the risk of consuming/breaking the
// request body NextAuth's own handler still needs to read. Per-email is
// the core protection anyway -- it's what stops one target inbox from
// being spammed and one script from burning Resend sends on one address.
export function checkSignInRateLimit(email: string): boolean {
  const key = email.toLowerCase();
  const now = Date.now();
  const entry = hits.get(key);
  if (!entry || now - entry.windowStart > WINDOW_MS) {
    hits.set(key, { count: 1, windowStart: now });
    return true;
  }
  if (entry.count >= MAX_ATTEMPTS) return false;
  entry.count += 1;
  return true;
}
