CREATE TABLE "scout_custom_species" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"kind" "scout_event_kind" DEFAULT 'pest' NOT NULL,
	"common_name" text NOT NULL,
	"scientific_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "scout_custom_species" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "scout_custom_species" ADD CONSTRAINT "scout_custom_species_organization_id_scout_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."scout_organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "scout_custom_species_organization_id_idx" ON "scout_custom_species" USING btree ("organization_id");