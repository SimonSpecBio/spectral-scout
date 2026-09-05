import Link from "next/link";
import ResendForm from "./ResendForm";

// Reached via auth.ts's pages.verifyRequest -- Auth.js appends the
// submitted address as ?email= on this redirect automatically. No email in
// the URL (a direct visit, or an older/cached link) just skips naming it
// rather than guessing.
export default async function CheckEmailPage({ searchParams }: { searchParams: Promise<{ email?: string }> }) {
  const { email } = await searchParams;

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-6 px-7 py-16 text-center">
      <img src="/spectral-biocontrol-wordmark.png" alt="Spectral Biocontrol" width={600} height={170} className="h-11 w-auto" />

      <div className="flex flex-col items-center gap-2">
        <h1 className="text-2xl font-semibold">Check your email</h1>
        {email ? (
          <p className="text-sm text-[var(--text-dim)]">
            We sent a sign-in link to <span className="font-medium text-[var(--text)]">{email}</span>.
          </p>
        ) : (
          <p className="text-sm text-[var(--text-dim)]">We sent a sign-in link to your email address.</p>
        )}
      </div>

      <p className="max-w-[360px] text-xs leading-relaxed text-[var(--text-faint)]">
        Don&rsquo;t see it? Check your spam or promotions folder -- it can take a minute to arrive. The link expires in 24 hours
        and only works once.
      </p>

      {email && <ResendForm email={email} />}

      <Link href="/sign-in" className="text-xs text-[var(--accent-text)] underline">
        Wrong address? Use a different one
      </Link>
    </main>
  );
}
