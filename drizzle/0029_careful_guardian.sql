ALTER TABLE "scout_treatment" ADD COLUMN "fixture_id" text;--> statement-breakpoint
ALTER TABLE "scout_treatment" ADD COLUMN "minutes_after_dark" integer;--> statement-breakpoint
ALTER TABLE "scout_treatment" ADD COLUMN "duration_min" integer;--> statement-breakpoint
ALTER TABLE "scout_treatment" ADD COLUMN "pulse_count" integer DEFAULT 1;