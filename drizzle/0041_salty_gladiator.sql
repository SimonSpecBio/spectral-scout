CREATE TABLE "scout_pest_event_deletion" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"pest_event_id" uuid NOT NULL,
	"pest_species" text NOT NULL,
	"facility_id" uuid NOT NULL,
	"facility_area_id" uuid,
	"deleted_by_user_id" uuid,
	"comment_count" integer NOT NULL,
	"photo_count" integer NOT NULL,
	"deleted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "scout_pest_event_deletion" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "scout_pest_event_deletion" ADD CONSTRAINT "scout_pest_event_deletion_organization_id_scout_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."scout_organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "scout_pest_event_deletion_organization_id_idx" ON "scout_pest_event_deletion" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "scout_pest_event_deletion_pest_event_id_idx" ON "scout_pest_event_deletion" USING btree ("pest_event_id");