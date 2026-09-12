import { consumeRateLimit, RATE_LIMIT_POLICIES } from "@/lib/rate-limit-store";

// The magic-link checkpoint in auth.ts has an email but no safe access to
// the raw request IP. Persisting this per-email quota in Postgres closes the
// prior multi-instance/cold-start gap while preserving the existing 3 per
// 15-minute threshold and user-facing flow.
export async function checkSignInRateLimit(email: string): Promise<boolean> {
  const result = await consumeRateLimit("auth.magic-link.email", email, RATE_LIMIT_POLICIES.signInEmail);
  return result.allowed;
}
