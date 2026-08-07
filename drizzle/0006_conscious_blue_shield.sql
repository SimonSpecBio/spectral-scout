CREATE TYPE "public"."scout_inventory_category" AS ENUM('beneficial', 'biopesticide', 'chemical');--> statement-breakpoint
CREATE TABLE "scout_inventory_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"category" "scout_inventory_category" NOT NULL,
	"name" text NOT NULL,
	"scientific_name" text,
	"unit" text NOT NULL,
	"quantity" numeric DEFAULT 0 NOT NULL,
	"reorder_level" numeric,
	"rei_hours" integer,
	"phi_days" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "scout_inventory_item" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "scout_inventory_order" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_id" uuid NOT NULL,
	"quantity" numeric NOT NULL,
	"supplier" text,
	"expected_at" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "scout_inventory_order" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "scout_treatment" ADD COLUMN "x" numeric;--> statement-breakpoint
ALTER TABLE "scout_treatment" ADD COLUMN "y" numeric;--> statement-breakpoint
ALTER TABLE "scout_treatment" ADD COLUMN "inventory_item_id" uuid;--> statement-breakpoint
ALTER TABLE "scout_treatment" ADD COLUMN "quantity_used" numeric;--> statement-breakpoint
ALTER TABLE "scout_inventory_item" ADD CONSTRAINT "scout_inventory_item_organization_id_scout_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."scout_organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scout_inventory_order" ADD CONSTRAINT "scout_inventory_order_item_id_scout_inventory_item_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."scout_inventory_item"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scout_treatment" ADD CONSTRAINT "scout_treatment_inventory_item_id_scout_inventory_item_id_fk" FOREIGN KEY ("inventory_item_id") REFERENCES "public"."scout_inventory_item"("id") ON DELETE set null ON UPDATE no action;