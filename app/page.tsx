import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";

// Public landing page -- unlike the other three apps, this one is a
// self-serve free tool, so "/" has to work for a signed-out visitor instead
// of bouncing straight to sign-in. Already-signed-in visitors get routed
// to their actual app.
export default async function Home() {
  const session = await auth();
  if (session?.role === "staff") redirect("/staff");
  if (session?.role === "grower") redirect("/app");

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center gap-6 px-6 text-center">
      <h1 className="text-4xl font-semibold">Spectral Scout</h1>
      <p className="text-[var(--text-dim)]">
        Free pest scouting, hotspot monitoring, and treatment history for greenhouse and indoor growers.
      </p>
      <Link
        href="/api/auth/signin"
        className="rounded-md bg-[var(--accent)] px-5 py-2.5 font-medium text-[var(--on-accent)]"
      >
        Sign in
      </Link>
      <p className="max-w-md text-sm text-[var(--text-faint)]">
        Scout is built by{" "}
        <a href="https://spectralbiocontrol.com" className="text-[var(--text-dim)] underline">
          Spectral Biocontrol
        </a>
        . Find and confirm a pest here, then treat it chemical-free with Spectral&apos;s light-based hardware when
        you&apos;re ready.
      </p>
    </main>
  );
}
