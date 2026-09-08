ALTER TABLE "scout_organization" ADD COLUMN "next_case_number" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "scout_pest_event" ADD COLUMN "case_number" integer;