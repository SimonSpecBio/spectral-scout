import Link from "next/link";
import SignInForm from "./SignInForm";

// Every reachable Auth.js error code (Task 602) mapped to plain-language
// copy with a recovery action, for a grower rather than a developer.
// RateLimited is this app's own code (auth.ts's signIn callback redirects
// here directly rather than letting NextAuth collapse it to the generic
// AccessDenied); everything else is a real Auth.js AuthError.type string.
// Unrecognized codes (including "Configuration", the catch-all Auth.js
// falls back to for anything not on its own client-safe allowlist) get the
// generic message rather than a blank/wrong one.
function errorMessageFor(code: string | undefined): string | null {
  switch (code) {
    case "RateLimited":
      return "You've requested a few sign-in links already. Check your inbox and spam folder, or try again in 15 minutes.";
    case "Verification":
      return "That sign-in link has expired or was already used. Request a new one below.";
    case "OAuthAccountNotLinked":
    case "AccountNotLinked":
      return "That email is already used by an account you signed up with a different way. Sign in below using the same method you used originally, and your accounts will link automatically.";
    case "AccessDenied":
      // Google's own "not an approved tester yet" rejection and a plain
      // cancelled-consent click both collapse into this same AuthError
      // type by the time it reaches the browser -- Auth.js doesn't pass
      // through which one it was. Worded to cover both rather than assert
      // a diagnosis it can't actually confirm (product brief, 5 Sep 2026,
      // Task 1).
      return "Google didn't complete that sign-in. If this account isn't approved for testing yet, use email below instead -- it works with any address.";
    case undefined:
      return null;
    default:
      // OAuthSignin, OAuthCallbackError, Configuration (Auth.js's own
      // catch-all for anything not on its client-safe list), and anything
      // else not specifically named above.
      return "Something went wrong signing you in. Try again below, or use a different sign-in method.";
  }
}

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; email?: string; callbackUrl?: string }>;
}) {
  const { error, email, callbackUrl } = await searchParams;
  const errorMessage = errorMessageFor(error);

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-6 px-7 py-16 text-center">
      <img src="/spectral-biocontrol-wordmark.png" alt="Spectral Biocontrol" width={600} height={170} className="h-11 w-auto" />

      <div className="flex flex-col items-center gap-2">
        <h1 className="text-2xl font-semibold">Sign in to Spectral Scout</h1>
        <p className="text-sm text-[var(--text-dim)]">Free, no card required</p>
      </div>

      {errorMessage && (
        <div className="w-full rounded-md p-3.5 text-left text-sm" style={{ background: "var(--danger-bg)", color: "var(--danger)" }}>
          {errorMessage}
        </div>
      )}

      <SignInForm initialEmail={email} callbackUrl={callbackUrl} />

      <div className="flex flex-col items-center gap-1">
        <a href="/api/demo-login" className="text-xs text-[var(--text-dim)] underline">
          Just want to poke around? Try the test account →
        </a>
        {/* Shared org, no per-visitor isolation -- explicit here rather
            than discovered the hard way (product brief, 5 Sep 2026, Task
            1: "graffiti is a real risk"). Photo uploads and invites are
            already disabled on this account for the same reason. */}
        <p className="text-[11px] text-[var(--text-faint)]">Shared sandbox. Don&rsquo;t put a real room here.</p>
      </div>

      <p className="max-w-[360px] text-xs leading-relaxed text-[var(--text-faint)]">
        <Link href="/privacy" className="text-[var(--accent-text)] underline">
          Privacy policy
        </Link>
        <br />
        Built by Spectral Biocontrol
      </p>
    </main>
  );
}
