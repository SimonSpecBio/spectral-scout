import { randomBytes } from "node:crypto";

// 30 days -- "never issue forever-live links" per the ticket. A grower
// re-shares (creating a fresh token) if a consultant still needs access
// past that; there's no renew-in-place action for v1.
export const SHARE_LINK_TTL_DAYS = 30;

// A separate unguessable value from the row's own id (see db/schema.ts's
// comment) -- 32 random bytes, base64url so it's URL-safe with no padding
// to strip.
export function generateShareToken(): string {
  return randomBytes(32).toString("base64url");
}
