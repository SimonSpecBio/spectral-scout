CREATE TABLE "scout_share_notification" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"pest_event_id" uuid NOT NULL,
	"from_user_id" uuid NOT NULL,
	"to_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "scout_share_notification" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "scout_share_notification" ADD CONSTRAINT "scout_share_notification_organization_id_scout_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."scout_organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scout_share_notification" ADD CONSTRAINT "scout_share_notification_pest_event_id_scout_pest_event_id_fk" FOREIGN KEY ("pest_event_id") REFERENCES "public"."scout_pest_event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "scout_share_notification_to_user_id_idx" ON "scout_share_notification" USING btree ("to_user_id");--> statement-breakpoint
CREATE INDEX "scout_share_notification_pest_event_id_idx" ON "scout_share_notification" USING btree ("pest_event_id");