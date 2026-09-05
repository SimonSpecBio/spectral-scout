"use server";

import { signIn, signOut } from "@/auth";

// Server actions backing the real /sign-in page (ticket recTJ5GagPLVKY62n) --
// calling signIn/signOut this way (rather than linking to /api/auth/signin
// or /api/auth/signout directly) is the documented Auth.js v5 pattern for a
// custom UI: it goes through the same CSRF-protected flow without ever
// showing the framework's own default pages.

export async function signOutAction() {
  await signOut({ redirectTo: "/" });
}

// callbackUrl rides as a hidden form field, not a closure-captured argument
// -- server actions serialize their bound arguments into the client
// bundle, and a user-supplied redirect target should never be trusted
// merely because it round-tripped through one. signIn's own redirect
// callback (auth.ts doesn't override it, so Auth.js's default same-origin
// check applies) still validates whatever comes through here.
export async function signInWithGoogleAction(formData: FormData) {
  const callbackUrl = typeof formData.get("callbackUrl") === "string" ? (formData.get("callbackUrl") as string) : undefined;
  await signIn("google", { redirectTo: callbackUrl || "/app" });
}

export interface EmailSignInResult {
  ok: boolean;
  error?: string;
}

// Split from signInWithGoogleAction (rather than one shared action) so a
// malformed address can be rejected inline instead of round-tripping to
// the provider and back. A *successful* signIn() call never actually
// returns here -- it redirects (to pages.verifyRequest on send, or
// pages.error on a real failure), which Next.js implements as a thrown
// signal the form can't meaningfully inspect. Only the early validation
// failure below is ever visibly returned to the caller.
export async function signInWithEmailAction(_prevState: EmailSignInResult, formData: FormData): Promise<EmailSignInResult> {
  const email = typeof formData.get("email") === "string" ? (formData.get("email") as string).trim().toLowerCase() : "";
  const callbackUrl = typeof formData.get("callbackUrl") === "string" ? (formData.get("callbackUrl") as string) : undefined;
  if (!email || !email.includes("@")) return { ok: false, error: "Enter a real email address." };

  await signIn("nodemailer", { email, redirectTo: callbackUrl || "/app" });
  return { ok: true };
}
