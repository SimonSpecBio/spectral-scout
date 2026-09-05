"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { signInWithEmailAction, type EmailSignInResult } from "@/lib/auth-actions";

// A client-side cooldown, not the real enforcement -- lib/rate-limit.ts's
// 3-per-15-minutes-per-email cap is what actually protects the Resend send;
// this just stops an impatient tap-tap-tap from silently walking into that
// limit with no explanation, showing a countdown instead. If the real limit
// is hit anyway (a different tab, a previous visit), signIn() redirects to
// /sign-in?error=RateLimited, which renders the honest message there.
const COOLDOWN_S = 45;
const INITIAL_STATE: EmailSignInResult = { ok: true };

function ResendButton({ secondsLeft }: { secondsLeft: number }) {
  const { pending } = useFormStatus();
  const disabled = pending || secondsLeft > 0;
  return (
    <button
      type="submit"
      disabled={disabled}
      className="rounded-md border border-[var(--border)] px-4 py-2 text-sm text-[var(--text-dim)] disabled:opacity-50"
    >
      {pending ? "Sending…" : secondsLeft > 0 ? `Resend link (${secondsLeft}s)` : "Resend link"}
    </button>
  );
}

export default function ResendForm({ email }: { email: string }) {
  const [state, formAction] = useActionState(signInWithEmailAction, INITIAL_STATE);
  const [secondsLeft, setSecondsLeft] = useState(COOLDOWN_S);

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const id = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [secondsLeft]);

  return (
    <form action={formAction} className="flex flex-col items-center gap-2">
      <input type="hidden" name="email" value={email} />
      <ResendButton secondsLeft={secondsLeft} />
      {state.error && <div className="text-xs" style={{ color: "var(--danger)" }}>{state.error}</div>}
    </form>
  );
}
