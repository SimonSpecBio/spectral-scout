CREATE TYPE "public"."scout_staff_audit_action" AS ENUM('view_org_data', 'resolve_escalation');--> statement-breakpoint
CREATE TABLE "scout_staff_audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"staff_user_id" uuid NOT NULL,
	"action" "scout_staff_audit_action" NOT NULL,
	"organization_id" uuid NOT NULL,
	"escalation_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "scout_staff_audit_log" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "scout_staff_audit_log" ADD CONSTRAINT "scout_staff_audit_log_organization_id_scout_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."scout_organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scout_staff_audit_log" ADD CONSTRAINT "scout_staff_audit_log_escalation_id_scout_escalation_id_fk" FOREIGN KEY ("escalation_id") REFERENCES "public"."scout_escalation"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "scout_staff_audit_log_organization_id_idx" ON "scout_staff_audit_log" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "scout_staff_audit_log_staff_user_id_idx" ON "scout_staff_audit_log" USING btree ("staff_user_id");