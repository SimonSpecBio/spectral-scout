CREATE TABLE "scout_idempotency_receipt" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL,
  "operation" text NOT NULL,
  "client_request_id" text NOT NULL,
  "request_fingerprint" text NOT NULL,
  "resource_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "completed_at" timestamp with time zone
);--> statement-breakpoint
ALTER TABLE "scout_idempotency_receipt" ADD CONSTRAINT "scout_idempotency_receipt_organization_id_scout_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."scout_organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "scout_idempotency_receipt_scope_key_unique" ON "scout_idempotency_receipt" USING btree ("organization_id","operation","client_request_id");--> statement-breakpoint
CREATE INDEX "scout_idempotency_receipt_org_operation_idx" ON "scout_idempotency_receipt" USING btree ("organization_id","operation");--> statement-breakpoint
ALTER TABLE "scout_idempotency_receipt" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "scout_treatment" DROP CONSTRAINT IF EXISTS "scout_treatment_client_request_id_unique";