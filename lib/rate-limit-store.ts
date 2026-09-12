import { createHash } from "node:crypto";
import { sql, type SQL } from "drizzle-orm";
import { db } from "@/db";

export type RateLimitPolicy = {
  limit: number;
  windowMs: number;
};

export type RateLimitResult = {
  allowed: boolean;
  count: number;
  limit: number;
  retryAfterSeconds: number;
  resetAt: Date;
};

type SqlExecutor = {
  execute(query: SQL): Promise<{ rows: unknown[] }>;
};

type CounterRow = { count: number | string };

export const RATE_LIMIT_POLICIES = {
  signInEmail: { limit: 3, windowMs: 15 * 60_000 },
  demoLoginIp: { limit: 30, windowMs: 15 * 60_000 },
  teamInviteActor: { limit: 20, windowMs: 60 * 60_000 },
  paidUploadActor: { limit: 120, windowMs: 60 * 60_000 },
} satisfies Record<string, RateLimitPolicy>;

export function rateLimitKey(scope: string, identifier: string): string {
  return createHash("sha256").update(`${scope}\0${identifier.trim().toLowerCase()}`).digest("hex");
}

/**
 * Consume one attempt from a fixed-window quota stored in Postgres.
 *
 * The INSERT .. ON CONFLICT .. DO UPDATE is one atomic statement. Every
 * server instance therefore increments the same row for the same
 * scope/key/window instead of maintaining a process-local counter.
 */
export async function consumeRateLimit(
  scope: string,
  identifier: string,
  policy: RateLimitPolicy,
  options: { now?: Date; executor?: SqlExecutor } = {}
): Promise<RateLimitResult> {
  if (!Number.isInteger(policy.limit) || policy.limit < 1) throw new Error("rate limit must be a positive integer");
  if (!Number.isInteger(policy.windowMs) || policy.windowMs < 1) throw new Error("rate limit window must be positive");

  const now = options.now ?? new Date();
  const executor = options.executor ?? db;
  const bucketStartMs = Math.floor(now.getTime() / policy.windowMs) * policy.windowMs;
  const bucketStart = new Date(bucketStartMs);
  const resetAt = new Date(bucketStartMs + policy.windowMs);
  const keyHash = rateLimitKey(scope, identifier);

  const result = await executor.execute(sql`
    INSERT INTO scout_rate_limit_bucket (
      scope,
      key_hash,
      bucket_start,
      count,
      expires_at
    )
    VALUES (
      ${scope},
      ${keyHash},
      ${bucketStart},
      1,
      ${new Date(resetAt.getTime() + policy.windowMs)}
    )
    ON CONFLICT (scope, key_hash, bucket_start)
    DO UPDATE SET count = scout_rate_limit_bucket.count + 1
    RETURNING count
  `);

  const row = result.rows[0] as CounterRow | undefined;
  if (!row) throw new Error("rate limit counter update returned no row");
  const count = Number(row.count);
  if (!Number.isFinite(count)) throw new Error("rate limit counter returned an invalid count");

  return {
    allowed: count <= policy.limit,
    count,
    limit: policy.limit,
    retryAfterSeconds: Math.max(1, Math.ceil((resetAt.getTime() - now.getTime()) / 1000)),
    resetAt,
  };
}

export async function enforceRateLimit(scope: string, identifier: string, policy: RateLimitPolicy): Promise<RateLimitResult> {
  return consumeRateLimit(scope, identifier, policy);
}
