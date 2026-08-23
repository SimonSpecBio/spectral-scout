CREATE TYPE "public"."scout_grower_type" AS ENUM('home_single_tent', 'home_multi_tent', 'home_room', 'commercial');--> statement-breakpoint
ALTER TABLE "scout_organization" ADD COLUMN "grower_type" "scout_grower_type";--> statement-breakpoint
ALTER TABLE "scout_organization" ADD COLUMN "grow_size_label" text;