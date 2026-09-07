ALTER TABLE "scout_observation" ADD COLUMN "client_request_id" text;--> statement-breakpoint
ALTER TABLE "scout_trap_reading" ADD COLUMN "client_request_id" text;--> statement-breakpoint
CREATE INDEX "scout_trap_reading_client_request_id_idx" ON "scout_trap_reading" USING btree ("client_request_id");--> statement-breakpoint
ALTER TABLE "scout_observation" ADD CONSTRAINT "scout_observation_client_request_id_unique" UNIQUE("client_request_id");