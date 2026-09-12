import { index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

export const rateLimitBuckets = pgTable(
  "scout_rate_limit_bucket",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    scope: text("scope").notNull(),
    keyHash: text("key_hash").notNull(),
    bucketStart: timestamp("bucket_start", { withTimezone: true }).notNull(),
    count: integer("count").notNull().default(0),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex("scout_rate_limit_bucket_scope_key_window_unique").on(table.scope, table.keyHash, table.bucketStart),
    index("scout_rate_limit_bucket_expires_at_idx").on(table.expiresAt),
  ]
);
