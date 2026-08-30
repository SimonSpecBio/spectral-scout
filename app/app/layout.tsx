import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { parseTheme, THEME_COOKIE } from "@/lib/theme";
import { requireGrowerSession } from "@/lib/session";
import BottomNav from "./BottomNav";
import HeaderMenu from "./HeaderMenu";
import InstallPrompt from "./InstallPrompt";
import OfflineQueueBadge from "./OfflineQueueBadge";
import Sidebar from "./Sidebar";
import ThemeProvider from "./ThemeProvider";

// Same lg breakpoint drives both halves of the responsive nav split
// (ARCHITECTURE.md's nav section): Sidebar is desktop-only, BottomNav (plus
// the header's secondary-screens overflow menu) is mobile/tablet-only.
// Never both at once.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await requireGrowerSession();
  if (!session) redirect("/");
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value);

  return (
    <ThemeProvider initialTheme={theme}>
      <div className="mx-auto flex max-w-6xl gap-8 px-6 pb-28 pt-1.5 lg:pb-8 lg:pt-8">
        <Sidebar email={session.user?.email} isPilot={session.accountTier === "pilot"} />
        <div className="flex min-w-0 flex-1 flex-col gap-1.5 lg:gap-6">
          <header className="flex items-center justify-end lg:hidden">
            <div className="flex items-center gap-2">
              {session.accountTier === "pilot" && (
                <span className="rounded-full bg-[var(--accent)]/20 px-3 py-1 text-xs text-[var(--accent)]">
                  Pilot program
                </span>
              )}
              <Link href="/app/notifications" aria-label="Notifications" className="flex h-8 w-8 items-center justify-center text-[var(--text-faint)]">
                <svg width="17" height="17" viewBox="0 0 17 17" fill="none">
                  <path
                    d="M8.5 1.5c-2 0-3.5 1.6-3.5 3.6v2.4l-1 2.5h9l-1-2.5V5.1c0-2-1.5-3.6-3.5-3.6z"
                    stroke="currentColor"
                    strokeWidth="1.2"
                    strokeLinejoin="round"
                  />
                  <path d="M7 12.5a1.5 1.5 0 0 0 3 0" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                </svg>
              </Link>
              <HeaderMenu email={session.user?.email} />
            </div>
          </header>
          {children}
        </div>
        <BottomNav />
        <OfflineQueueBadge />
        <InstallPrompt />
      </div>
    </ThemeProvider>
  );
}
