ALTER TABLE "scout_monitoring_threshold" ALTER COLUMN "infested_pct_threshold" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "scout_monitoring_threshold" ADD COLUMN "density_threshold" numeric;