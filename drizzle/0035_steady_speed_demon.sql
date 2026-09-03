CREATE TABLE "scout_push_alert_sent" (
	"alert_key" text PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "scout_push_alert_sent" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "scout_task" ADD COLUMN "last_overdue_nudge_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "scout_push_alert_sent" ADD CONSTRAINT "scout_push_alert_sent_organization_id_scout_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."scout_organization"("id") ON DELETE cascade ON UPDATE no action;