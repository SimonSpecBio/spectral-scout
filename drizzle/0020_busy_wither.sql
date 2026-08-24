ALTER TYPE "public"."scout_task_type" ADD VALUE 'establishment_check';--> statement-breakpoint
CREATE TABLE "scout_establishment_check" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"task_id" uuid NOT NULL,
	"treatment_id" uuid NOT NULL,
	"agent_name" text NOT NULL,
	"established" boolean,
	"notes" text,
	"checked_at" timestamp with time zone,
	"checked_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "scout_establishment_check" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "scout_establishment_check" ADD CONSTRAINT "scout_establishment_check_organization_id_scout_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."scout_organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scout_establishment_check" ADD CONSTRAINT "scout_establishment_check_task_id_scout_task_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."scout_task"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scout_establishment_check" ADD CONSTRAINT "scout_establishment_check_treatment_id_scout_treatment_id_fk" FOREIGN KEY ("treatment_id") REFERENCES "public"."scout_treatment"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "scout_establishment_check_organization_id_idx" ON "scout_establishment_check" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "scout_establishment_check_task_id_idx" ON "scout_establishment_check" USING btree ("task_id");