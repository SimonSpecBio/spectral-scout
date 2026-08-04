import { redirect } from "next/navigation";
import { requireGrowerSession } from "@/lib/session";
import TabBar from "./TabBar";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await requireGrowerSession();
  if (!session) redirect("/");

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 px-6 py-8 pb-24 sm:pb-8">
      <header className="flex items-center justify-between">
        <span className="font-semibold">Spectral Scout</span>
        {session.accountTier === "pilot" && (
          <span className="rounded-full bg-[var(--accent)]/20 px-3 py-1 text-xs text-[var(--accent)]">
            Pilot program
          </span>
        )}
      </header>
      <TabBar />
      {children}
    </div>
  );
}
