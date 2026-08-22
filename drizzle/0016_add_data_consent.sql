ALTER TABLE "scout_organization" ADD COLUMN "data_consent_version" text;--> statement-breakpoint
ALTER TABLE "scout_organization" ADD COLUMN "data_consent_accepted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "scout_organization" ADD COLUMN "data_consent_accepted_by_user_id" uuid;