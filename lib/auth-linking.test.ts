import { describe, expect, it } from "vitest";
import { isGoogleEmailAuthoritative } from "./auth-linking";

// Task 764 acceptance matrix, at the trust-decision level: only a Google
// profile whose email Google has verified may auto-link/create an account.
describe("isGoogleEmailAuthoritative", () => {
  it("trusts a verified consumer Gmail account", () => {
    expect(isGoogleEmailAuthoritative({ email: "grower@gmail.com", email_verified: true })).toBe(true);
  });

  it("trusts a verified Google Workspace account, including on a non-Google domain", () => {
    expect(isGoogleEmailAuthoritative({ email: "ipm@acmefarms.com", email_verified: true })).toBe(true);
  });

  it("accepts the stringified 'true' some Google responses send", () => {
    expect(isGoogleEmailAuthoritative({ email_verified: "true" })).toBe(true);
  });

  it("refuses an unverified Google email (the takeover vector)", () => {
    expect(isGoogleEmailAuthoritative({ email: "victim@company.com", email_verified: false })).toBe(false);
    expect(isGoogleEmailAuthoritative({ email_verified: "false" })).toBe(false);
  });

  it("refuses when the verification claim is absent or malformed -- fail closed", () => {
    expect(isGoogleEmailAuthoritative({ email: "someone@example.com" })).toBe(false);
    expect(isGoogleEmailAuthoritative({ email_verified: 1 })).toBe(false);
    expect(isGoogleEmailAuthoritative({ email_verified: null })).toBe(false);
    expect(isGoogleEmailAuthoritative(null)).toBe(false);
    expect(isGoogleEmailAuthoritative(undefined)).toBe(false);
    expect(isGoogleEmailAuthoritative("not-an-object")).toBe(false);
  });
});
