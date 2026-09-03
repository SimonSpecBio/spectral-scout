import Link from "next/link";

// Static fallback the service worker serves for a navigation request that
// fails with no cached page to fall back to (INSTALL_PWA.md ยง2/ยง6) --
// deliberately has no server data dependency so it can be precached at
// install time and rendered with zero network. The first sentence used to
// explain *why* nothing's cached, redundant with the person already seeing
// a blank offline screen, and there was no way off it besides the
// browser's own back button -- which returns to the logging screen that
// was just submitted, reading as if the submission failed even though it
// safely queued (ticket found in QA, 2026-09-03). Simplified to just the
// reassurance, plus a real way forward.
export default function OfflinePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-xl font-semibold">You&apos;re offline</h1>
      <p className="text-sm text-[var(--text-dim)]">
        Scouting logs, trap reads, and treatments you&apos;ve already submitted are safe and will sync once you&apos;re
        back online.
      </p>
      <Link href="/app" className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-[var(--on-accent)]">
        Go to Home
      </Link>
    </main>
  );
}
