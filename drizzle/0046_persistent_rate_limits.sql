CREATE TABLE "scout_rate_limit_bucket" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "scope" text NOT NULL,
  "key_hash" text NOT NULL,
  "bucket_start" timestamp with time zone NOT NULL,
  "count" integer DEFAULT 0 NOT NULL,
  "expires_at" timestamp with time zone NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX "scout_rate_limit_bucket_scope_key_window_unique" ON "scout_rate_limit_bucket" USING btree ("scope","key_hash","bucket_start");--> statement-breakpoint
CREATE INDEX "scout_rate_limit_bucket_expires_at_idx" ON "scout_rate_limit_bucket" USING btree ("expires_at");