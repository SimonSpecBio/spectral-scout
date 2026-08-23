ALTER TABLE "scout_inventory_item" ADD COLUMN "unit_cost" numeric;--> statement-breakpoint
ALTER TABLE "scout_inventory_order" ADD COLUMN "supplier_contact" text;--> statement-breakpoint
ALTER TABLE "scout_inventory_order" ADD COLUMN "unit_cost" numeric;--> statement-breakpoint
ALTER TABLE "scout_inventory_order" ADD COLUMN "total_cost" numeric;