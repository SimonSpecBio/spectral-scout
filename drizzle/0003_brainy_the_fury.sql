CREATE TYPE "public"."scout_assessment_type" AS ENUM('pest_count', 'disease_severity');--> statement-breakpoint
CREATE TYPE "public"."scout_event_kind" AS ENUM('pest', 'pathogen');--> statement-breakpoint
ALTER TABLE "scout_pest_event" ADD COLUMN "kind" "scout_event_kind" DEFAULT 'pest' NOT NULL;--> statement-breakpoint
ALTER TABLE "scout_pest_event" ADD COLUMN "scientific_name" text;--> statement-breakpoint
ALTER TABLE "scout_observation" ADD COLUMN "assessment_type" "scout_assessment_type" DEFAULT 'pest_count' NOT NULL;