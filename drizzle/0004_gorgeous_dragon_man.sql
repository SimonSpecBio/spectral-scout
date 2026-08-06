CREATE TABLE "scout_trap_reading" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trap_id" uuid NOT NULL,
	"pest_species" text NOT NULL,
	"count" integer NOT NULL,
	"days_deployed" integer NOT NULL,
	"submitted_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "scout_trap_reading" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "scout_trap_threshold" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"pest_species" text NOT NULL,
	"catch_per_day_threshold" numeric NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "scout_trap_threshold" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "scout_trap" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"facility_id" uuid NOT NULL,
	"facility_area_id" uuid NOT NULL,
	"x" numeric NOT NULL,
	"y" numeric NOT NULL,
	"label" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "scout_trap" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "scout_trap_reading" ADD CONSTRAINT "scout_trap_reading_trap_id_scout_trap_id_fk" FOREIGN KEY ("trap_id") REFERENCES "public"."scout_trap"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scout_trap_threshold" ADD CONSTRAINT "scout_trap_threshold_organization_id_scout_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."scout_organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scout_trap" ADD CONSTRAINT "scout_trap_facility_id_scout_facility_id_fk" FOREIGN KEY ("facility_id") REFERENCES "public"."scout_facility"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scout_trap" ADD CONSTRAINT "scout_trap_facility_area_id_scout_facility_area_id_fk" FOREIGN KEY ("facility_area_id") REFERENCES "public"."scout_facility_area"("id") ON DELETE cascade ON UPDATE no action;