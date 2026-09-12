// Account-linking trust decision (Task 764).
//
// The Google provider runs with allowDangerousEmailAccountLinking, which
// auto-links a Google sign-in to an existing user row that has the same email
// (created, most often, by an earlier magic-link sign-in). That is only safe
// when Google is actually the authority for the address -- i.e. Google has
// verified it (email_verified). Consumer Gmail and Google Workspace accounts,
// including Workspace on a non-Google (custom) domain, are always verified, so
// those keep linking exactly as before. A Google account that asserts an
// UNVERIFIED email is an untrusted assertion: allowing it to auto-link would
// let it join (or create) an account for an address it may not own -- an
// account-takeover vector into an existing organization. Such a sign-in is
// refused; the person is directed to their original method (magic-link to the
// real inbox), which is the "fresh proof through the existing account" path.
//
// Google's OIDC returns email_verified as a boolean; some responses stringify
// it, so accept both true and "true" and treat everything else (false,
// "false", missing, wrong-typed, non-object) as not authoritative.
export function isGoogleEmailAuthoritative(profile: unknown): boolean {
  if (!profile || typeof profile !== "object") return false;
  const verified = (profile as { email_verified?: unknown }).email_verified;
  return verified === true || verified === "true";
}
