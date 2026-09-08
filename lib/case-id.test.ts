import { describe, expect, it } from "vitest";
import { formatCaseId } from "./case-id";

describe("formatCaseId", () => {
  it("formats a real case number as CASE-NNNNNN, zero-padded to 6 digits", () => {
    expect(formatCaseId(1247, "irrelevant-uuid")).toBe("CASE-001247");
    expect(formatCaseId(1, "irrelevant-uuid")).toBe("CASE-000001");
  });

  it("doesn't truncate a number wider than 6 digits", () => {
    expect(formatCaseId(1234567, "irrelevant-uuid")).toBe("CASE-1234567");
  });

  it("falls back to the old short-uuid form when caseNumber is null (a pre-backfill straggler)", () => {
    expect(formatCaseId(null, "abcd1234-5678-90ab-cdef-1234567890ab")).toBe("PE-ABCD");
  });
});
