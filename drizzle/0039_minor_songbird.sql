DROP INDEX "scout_observation_facility_area_id_idx";--> statement-breakpoint
DROP INDEX "scout_observation_promoted_pest_event_id_idx";--> statement-breakpoint
DROP INDEX "scout_trap_reading_trap_id_idx";--> statement-breakpoint
CREATE INDEX "scout_observation_facility_area_id_created_at_idx" ON "scout_observation" USING btree ("facility_area_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "scout_observation_promoted_pest_event_id_created_at_idx" ON "scout_observation" USING btree ("promoted_pest_event_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "scout_task_due_at_idx" ON "scout_task" USING btree ("due_at");--> statement-breakpoint
CREATE INDEX "scout_trap_reading_trap_id_created_at_idx" ON "scout_trap_reading" USING btree ("trap_id","created_at" DESC NULLS LAST);