import { redirect } from "next/navigation";
import { requireGrowerSession } from "@/lib/session";
import BottomNav from "./BottomNav";
import HeaderMenu from "./HeaderMenu";
import InstallPrompt from "./InstallPrompt";
import OfflineQueueBadge from "./OfflineQueueBadge";
import Sidebar from "./Sidebar";

// Same lg breakpoint drives both halves of the responsive nav split
// (ARCHITECTURE.md's nav section): Sidebar is desktop-only, BottomNav (plus
// the header's secondary-screens overflow menu) is mobile/tablet-only.
// Never both at once.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await requireGrowerSession();
  if (!session) redirect("/");

  return (
    <div className="mx-auto flex max-w-6xl gap-8 px-6 pb-28 pt-8 lg:pb-8">
      <Sidebar email={session.user?.email} isPilot={session.accountTier === "pilot"} />
      <div className="flex min-w-0 flex-1 flex-col gap-6">
        <header className="flex items-center justify-between lg:hidden">
          <span className="font-semibold">Spectral Scout</span>
          <div className="flex items-center gap-2">
            {session.accountTier === "pilot" && (
              <span className="rounded-full bg-[var(--accent)]/20 px-3 py-1 text-xs text-[var(--accent)]">
                Pilot program
              </span>
            )}
            <HeaderMenu email={session.user?.email} />
          </div>
        </header>
        {children}
      </div>
      <BottomNav />
      <OfflineQueueBadge />
      <InstallPrompt />
    </div>
  );
}
