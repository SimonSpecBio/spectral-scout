ALTER TABLE "scout_observation" ADD COLUMN "leaf_grid" jsonb;--> statement-breakpoint
ALTER TABLE "scout_observation" ADD COLUMN "avg_temp_f" integer;--> statement-breakpoint
ALTER TABLE "scout_observation" ADD COLUMN "avg_humidity_pct" integer;--> statement-breakpoint
ALTER TABLE "scout_observation" ADD COLUMN "avg_light_hrs" integer;