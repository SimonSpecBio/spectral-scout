// Static fallback the service worker serves for a navigation request that
// fails with no cached page to fall back to (INSTALL_PWA.md ยง2/ยง6) --
// deliberately has no server data dependency so it can be precached at
// install time and rendered with zero network.
export default function OfflinePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-xl font-semibold">You&apos;re offline</h1>
      <p className="text-sm text-[var(--text-dim)]">
        This page hasn&apos;t been visited yet, so there&apos;s nothing cached to show. Scouting logs, trap reads, and
        treatments you&apos;ve already submitted are safe and will sync once you&apos;re back online.
      </p>
    </main>
  );
}
