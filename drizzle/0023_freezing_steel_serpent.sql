CREATE TABLE "scout_escalation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"pest_event_id" uuid NOT NULL,
	"requested_by_user_id" uuid NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	"resolved_by_staff_id" uuid,
	"staff_response" text
);
--> statement-breakpoint
ALTER TABLE "scout_escalation" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "scout_escalation" ADD CONSTRAINT "scout_escalation_organization_id_scout_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."scout_organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scout_escalation" ADD CONSTRAINT "scout_escalation_pest_event_id_scout_pest_event_id_fk" FOREIGN KEY ("pest_event_id") REFERENCES "public"."scout_pest_event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "scout_escalation_pest_event_id_idx" ON "scout_escalation" USING btree ("pest_event_id");--> statement-breakpoint
CREATE INDEX "scout_escalation_organization_id_idx" ON "scout_escalation" USING btree ("organization_id");