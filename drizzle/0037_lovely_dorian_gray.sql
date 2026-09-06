ALTER TABLE "scout_pest_event" ADD COLUMN "client_request_id" text;--> statement-breakpoint
ALTER TABLE "scout_treatment" ADD COLUMN "client_request_id" text;--> statement-breakpoint
ALTER TABLE "scout_pest_event" ADD CONSTRAINT "scout_pest_event_client_request_id_unique" UNIQUE("client_request_id");--> statement-breakpoint
ALTER TABLE "scout_treatment" ADD CONSTRAINT "scout_treatment_client_request_id_unique" UNIQUE("client_request_id");