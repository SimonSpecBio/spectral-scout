"use client";

import { useActionState, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import { signInWithEmailAction, signInWithGoogleAction, type EmailSignInResult } from "@/lib/auth-actions";
import { useStandalonePwa } from "@/lib/use-standalone-pwa";

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.81.54-1.84.87-3.04.87-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18Z" />
      <path fill="#FBBC05" d="M3.97 10.73A5.4 5.4 0 0 1 3.68 9c0-.6.1-1.19.28-1.73V4.94H.96A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.06l3.01-2.33Z" />
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.51.46 3.44 1.35l2.59-2.59A8.53 8.53 0 0 0 9 0 9 9 0 0 0 .96 4.94l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58Z" />
    </svg>
  );
}

function GoogleButton({ callbackUrl }: { callbackUrl?: string }) {
  return (
    <form action={signInWithGoogleAction} className="w-full">
      <input type="hidden" name="callbackUrl" value={callbackUrl ?? ""} />
      <button
        type="submit"
        className="flex w-full items-center justify-center gap-2.5 rounded-md border border-[var(--border)] bg-[var(--surface)] px-5 py-3.5 text-sm font-medium text-[var(--text)]"
      >
        <GoogleMark />
        Continue with Google
      </button>
    </form>
  );
}

function EmailSubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-md bg-[var(--accent)] px-5 py-3.5 text-sm font-medium text-[var(--on-accent)] disabled:opacity-60"
    >
      {pending ? "Sending link…" : "Continue with email"}
    </button>
  );
}

const EMAIL_INITIAL_STATE: EmailSignInResult = { ok: true };

function EmailForm({ initialEmail, callbackUrl }: { initialEmail?: string; callbackUrl?: string }) {
  const [state, formAction] = useActionState(signInWithEmailAction, EMAIL_INITIAL_STATE);
  const isStandalone = useStandalonePwa();
  const inputRef = useRef<HTMLInputElement>(null);

  // Desktop-only autofocus (ticket's own spec) -- a mobile keyboard
  // snapping open the instant this page loads, before the grower has even
  // read it, is the opposite of helpful. "pointer: fine" is the standard
  // desktop-vs-touch signal; this only ever calls the imperative .focus()
  // DOM method, never renders anything differently, so it doesn't need
  // hydration-safe state gating the way a rendered value would.
  useEffect(() => {
    if (window.matchMedia("(pointer: fine)").matches) inputRef.current?.focus();
  }, []);

  return (
    <form action={formAction} className="flex w-full flex-col gap-2">
      <input type="hidden" name="callbackUrl" value={callbackUrl ?? ""} />
      <label htmlFor="email" className="sr-only">
        Email address
      </label>
      <input
        ref={inputRef}
        id="email"
        name="email"
        type="email"
        inputMode="email"
        autoComplete="email"
        autoFocus={!isStandalone}
        defaultValue={initialEmail}
        placeholder="you@company.com"
        required
        className="w-full rounded-md border border-[var(--border)] bg-transparent px-4 py-3.5 text-base"
        style={{ fontSize: 16 }}
      />
      {state.error && (
        <div className="rounded-md p-2.5 text-left text-xs" style={{ background: "var(--danger-bg)", color: "var(--danger)" }}>
          {state.error}
        </div>
      )}
      <EmailSubmitButton />
    </form>
  );
}

// Order flips for an installed PWA (ticket's own spec): Google OAuth inside
// a standalone webview is unreliable on some Android/iOS versions, so the
// universal magic-link path leads there instead.
export default function SignInForm({ initialEmail, callbackUrl }: { initialEmail?: string; callbackUrl?: string }) {
  const isStandalone = useStandalonePwa();
  const google = <GoogleButton key="google" callbackUrl={callbackUrl} />;
  const email = <EmailForm key="email" initialEmail={initialEmail} callbackUrl={callbackUrl} />;
  const divider = (
    <div key="divider" className="flex w-full items-center gap-3 text-xs text-[var(--text-faint)]">
      <div className="h-px flex-1 bg-[var(--border)]" />
      or
      <div className="h-px flex-1 bg-[var(--border)]" />
    </div>
  );

  return (
    <div className="flex w-full flex-col items-center gap-3">
      {isStandalone ? [email, divider, google] : [google, divider, email]}
    </div>
  );
}
