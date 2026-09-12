import { index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { organizations } from "./schema";

// Durable replay identity for field-capture mutations. The client key is not
// globally unique: two independent organizations may legitimately generate
// the same UUID/key. Operation is part of the identity so one capture key can
// never alias a different mutation type inside the same tenant.
export const idempotencyReceipts = pgTable(
  "scout_idempotency_receipt",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    operation: text("operation").notNull(),
    clientRequestId: text("client_request_id").notNull(),
    requestFingerprint: text("request_fingerprint").notNull(),
    resourceId: uuid("resource_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("scout_idempotency_receipt_scope_key_unique").on(
      table.organizationId,
      table.operation,
      table.clientRequestId
    ),
    index("scout_idempotency_receipt_org_operation_idx").on(table.organizationId, table.operation),
  ]
).enableRLS();
