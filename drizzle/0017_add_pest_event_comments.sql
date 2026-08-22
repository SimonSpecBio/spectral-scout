CREATE TABLE "scout_pest_event_comment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pest_event_id" uuid NOT NULL,
	"author_user_id" uuid,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "scout_pest_event_comment" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "scout_pest_event_comment" ADD CONSTRAINT "scout_pest_event_comment_pest_event_id_scout_pest_event_id_fk" FOREIGN KEY ("pest_event_id") REFERENCES "public"."scout_pest_event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "scout_pest_event_comment_pest_event_id_idx" ON "scout_pest_event_comment" USING btree ("pest_event_id");