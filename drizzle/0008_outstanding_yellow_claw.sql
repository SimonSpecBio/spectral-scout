CREATE TABLE "scout_monitoring_threshold" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"pest_species" text NOT NULL,
	"infested_pct_threshold" numeric NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "scout_monitoring_threshold" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "scout_monitoring_threshold" ADD CONSTRAINT "scout_monitoring_threshold_organization_id_scout_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."scout_organization"("id") ON DELETE cascade ON UPDATE no action;