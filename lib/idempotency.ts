import { createHash } from "node:crypto";
import { sql, type SQL } from "drizzle-orm";

export class IdempotencyConflictError extends Error {
  constructor() {
    super("Idempotency key was already used with a different request payload");
    this.name = "IdempotencyConflictError";
  }
}

type SqlExecutor = {
  execute(query: SQL): Promise<{ rows: unknown[] }>;
};

type ReceiptRow = {
  request_fingerprint: string;
  resource_id: string | null;
};

export type IdempotencyClaim = {
  key: string;
  operation: string;
  fingerprint: string;
  replay: boolean;
  resourceId: string | null;
};

function normalizeForFingerprint(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(normalizeForFingerprint);
  if (!value || typeof value !== "object") return value;

  const normalized: Record<string, unknown> = {};
  for (const key of Object.keys(value as Record<string, unknown>).sort()) {
    const child = (value as Record<string, unknown>)[key];
    if (child !== undefined) normalized[key] = normalizeForFingerprint(child);
  }
  return normalized;
}

export function requestFingerprint(payload: unknown): string {
  const canonical = JSON.stringify(normalizeForFingerprint(payload));
  return createHash("sha256").update(canonical).digest("hex");
}

/**
 * Claims a replay key inside the caller's existing business transaction.
 *
 * The unique boundary is (organization, operation, clientRequestId), not the
 * client-supplied key by itself. PostgreSQL's unique-index locking makes two
 * concurrent claims for the same tuple serialize: the loser observes the
 * committed receipt after the winner completes. A changed semantic payload
 * for an already-used tuple is a conflict, never a silent replay.
 */
export async function claimIdempotencyKey(
  executor: SqlExecutor,
  input: { organizationId: string; operation: string; clientRequestId: string; payload: unknown }
): Promise<IdempotencyClaim> {
  const fingerprint = requestFingerprint(input.payload);
  const insertedResult = await executor.execute(sql`
    INSERT INTO scout_idempotency_receipt (
      organization_id,
      operation,
      client_request_id,
      request_fingerprint
    )
    VALUES (
      ${input.organizationId}::uuid,
      ${input.operation},
      ${input.clientRequestId},
      ${fingerprint}
    )
    ON CONFLICT (organization_id, operation, client_request_id) DO NOTHING
    RETURNING request_fingerprint, resource_id
  `);
  const inserted = insertedResult.rows[0] as ReceiptRow | undefined;
  if (inserted) {
    return {
      key: input.clientRequestId,
      operation: input.operation,
      fingerprint,
      replay: false,
      resourceId: inserted.resource_id,
    };
  }

  const existingResult = await executor.execute(sql`
    SELECT request_fingerprint, resource_id
    FROM scout_idempotency_receipt
    WHERE organization_id = ${input.organizationId}::uuid
      AND operation = ${input.operation}
      AND client_request_id = ${input.clientRequestId}
    LIMIT 1
  `);
  const existing = existingResult.rows[0] as ReceiptRow | undefined;
  if (!existing) {
    throw new Error("Idempotency receipt conflict resolved without an existing receipt");
  }
  if (existing.request_fingerprint !== fingerprint) throw new IdempotencyConflictError();

  return {
    key: input.clientRequestId,
    operation: input.operation,
    fingerprint,
    replay: true,
    resourceId: existing.resource_id,
  };
}

export async function completeIdempotencyKey(
  executor: SqlExecutor,
  input: { organizationId: string; operation: string; clientRequestId: string; resourceId: string }
): Promise<void> {
  await executor.execute(sql`
    UPDATE scout_idempotency_receipt
    SET resource_id = ${input.resourceId}::uuid,
        completed_at = NOW()
    WHERE organization_id = ${input.organizationId}::uuid
      AND operation = ${input.operation}
      AND client_request_id = ${input.clientRequestId}
  `);
}
