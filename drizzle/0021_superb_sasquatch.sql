CREATE TABLE "scout_share_link" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"token" text NOT NULL,
	"pest_event_id" uuid NOT NULL,
	"created_by_user_id" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "scout_share_link_token_unique" UNIQUE("token")
);
--> statement-breakpoint
ALTER TABLE "scout_share_link" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "scout_share_link" ADD CONSTRAINT "scout_share_link_organization_id_scout_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."scout_organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scout_share_link" ADD CONSTRAINT "scout_share_link_pest_event_id_scout_pest_event_id_fk" FOREIGN KEY ("pest_event_id") REFERENCES "public"."scout_pest_event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "scout_share_link_pest_event_id_idx" ON "scout_share_link" USING btree ("pest_event_id");--> statement-breakpoint
CREATE INDEX "scout_share_link_token_idx" ON "scout_share_link" USING btree ("token");