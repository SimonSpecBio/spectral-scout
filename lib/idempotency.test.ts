import { describe, expect, it } from "vitest";
import { claimIdempotencyKey, IdempotencyConflictError, requestFingerprint } from "@/lib/idempotency";

class FakeExecutor {
  private readonly responses: Array<{ rows: unknown[] }>;

  constructor(...responses: Array<{ rows: unknown[] }>) {
    this.responses = responses;
  }

  async execute() {
    const response = this.responses.shift();
    if (!response) throw new Error("Unexpected execute call");
    return response;
  }
}

describe("requestFingerprint", () => {
  it("is stable across object key order and preserves dates", () => {
    const left = requestFingerprint({ b: 2, a: 1, at: new Date("2026-09-12T08:00:00.000Z") });
    const right = requestFingerprint({ at: new Date("2026-09-12T08:00:00.000Z"), a: 1, b: 2 });
    expect(left).toBe(right);
    expect(left).not.toBe(requestFingerprint({ a: 1, b: 2, at: new Date("2026-09-12T09:00:00.000Z") }));
  });
});

describe("claimIdempotencyKey", () => {
  const input = {
    organizationId: "11111111-1111-4111-8111-111111111111",
    operation: "treatment.create",
    clientRequestId: "retry-key",
    payload: { facilityId: "f1", product: "agent", quantityUsed: 10 },
  };

  it("marks the first successful claim as new", async () => {
    const fingerprint = requestFingerprint(input.payload);
    const claim = await claimIdempotencyKey(
      new FakeExecutor({ rows: [{ request_fingerprint: fingerprint, resource_id: null }] }),
      input
    );
    expect(claim.replay).toBe(false);
  });

  it("returns the completed resource for an identical replay", async () => {
    const fingerprint = requestFingerprint(input.payload);
    const claim = await claimIdempotencyKey(
      new FakeExecutor(
        { rows: [] },
        { rows: [{ request_fingerprint: fingerprint, resource_id: "22222222-2222-4222-8222-222222222222" }] }
      ),
      input
    );
    expect(claim).toMatchObject({ replay: true, resourceId: "22222222-2222-4222-8222-222222222222" });
  });

  it("rejects same tenant + operation + key with changed payload", async () => {
    await expect(
      claimIdempotencyKey(
        new FakeExecutor(
          { rows: [] },
          { rows: [{ request_fingerprint: requestFingerprint({ different: true }), resource_id: "22222222-2222-4222-8222-222222222222" }] }
        ),
        input
      )
    ).rejects.toBeInstanceOf(IdempotencyConflictError);
  });
});
