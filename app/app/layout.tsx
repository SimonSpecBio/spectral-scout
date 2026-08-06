import { redirect } from "next/navigation";
import { requireGrowerSession } from "@/lib/session";
import BottomNav from "./BottomNav";
import HeaderMenu from "./HeaderMenu";
import QuickActionsMenu from "./QuickActionsMenu";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await requireGrowerSession();
  if (!session) redirect("/");

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 px-6 pb-28 pt-8 lg:pb-8">
      <header className="flex items-center justify-between">
        <span className="font-semibold">Spectral Scout</span>
        <div className="flex items-center gap-2">
          {session.accountTier === "pilot" && (
            <span className="rounded-full bg-[var(--accent)]/20 px-3 py-1 text-xs text-[var(--accent)]">
              Pilot program
            </span>
          )}
          {/* Desktop only -- mobile/tablet's nav + account access lives in
              BottomNav (destinations) and the More page (account/sign-out)
              instead. */}
          <div className="hidden lg:block">
            <HeaderMenu email={session.user?.email} />
          </div>
        </div>
      </header>
      {children}
      <div className="hidden lg:block">
        <QuickActionsMenu variant="corner" />
      </div>
      <BottomNav />
    </div>
  );
}
