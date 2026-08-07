CREATE TYPE "public"."scout_task_source" AS ENUM('manual', 'auto_program', 'auto_trigger');--> statement-breakpoint
CREATE TYPE "public"."scout_task_status" AS ENUM('open', 'done', 'snoozed');--> statement-breakpoint
CREATE TYPE "public"."scout_task_type" AS ENUM('scout', 'monitor', 'release', 'treatment', 'trap_read', 'sulfur', 'sanitation', 'test', 'other');--> statement-breakpoint
CREATE TABLE "scout_invite" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"email" text NOT NULL,
	"role" "scout_membership_role" DEFAULT 'member' NOT NULL,
	"invited_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "scout_invite" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "scout_task" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"title" text NOT NULL,
	"type" "scout_task_type" DEFAULT 'other' NOT NULL,
	"facility_id" uuid,
	"facility_area_id" uuid,
	"pest_event_id" uuid,
	"assignee_user_id" uuid,
	"created_by_user_id" uuid,
	"source" "scout_task_source" DEFAULT 'manual' NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"repeat_every_days" integer,
	"status" "scout_task_status" DEFAULT 'open' NOT NULL,
	"completed_at" timestamp with time zone,
	"completed_by_user_id" uuid,
	"minutes_spent" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "scout_task" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "scout_inventory_item" ADD COLUMN "cautions" text;--> statement-breakpoint
ALTER TABLE "scout_treatment" ADD COLUMN "minutes_spent" integer;--> statement-breakpoint
ALTER TABLE "scout_invite" ADD CONSTRAINT "scout_invite_organization_id_scout_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."scout_organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scout_task" ADD CONSTRAINT "scout_task_organization_id_scout_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."scout_organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scout_task" ADD CONSTRAINT "scout_task_facility_id_scout_facility_id_fk" FOREIGN KEY ("facility_id") REFERENCES "public"."scout_facility"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scout_task" ADD CONSTRAINT "scout_task_facility_area_id_scout_facility_area_id_fk" FOREIGN KEY ("facility_area_id") REFERENCES "public"."scout_facility_area"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scout_task" ADD CONSTRAINT "scout_task_pest_event_id_scout_pest_event_id_fk" FOREIGN KEY ("pest_event_id") REFERENCES "public"."scout_pest_event"("id") ON DELETE set null ON UPDATE no action;