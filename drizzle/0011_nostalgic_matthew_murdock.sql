DROP INDEX "scout_membership_user_id_idx";--> statement-breakpoint
ALTER TABLE "scout_membership" ADD CONSTRAINT "scout_membership_user_id_unique" UNIQUE("user_id");