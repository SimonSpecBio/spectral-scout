import { redirect } from "next/navigation";
import { requireGrowerSession } from "@/lib/session";
import FloatingAction from "./FloatingAction";
import HeaderMenu from "./HeaderMenu";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await requireGrowerSession();
  if (!session) redirect("/");

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 px-6 py-8">
      <header className="flex items-center justify-between">
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
      <FloatingAction />
    </div>
  );
}
