import Link from "next/link";
import { redirect } from "next/navigation";
import { requireGrowerSession } from "@/lib/session";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await requireGrowerSession();
  if (!session) redirect("/");

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <header className="mb-8 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <span className="font-semibold">Spectral Scout</span>
          <nav className="flex gap-4 text-sm text-[var(--text-dim)]">
            <Link href="/app">Dashboard</Link>
            <Link href="/app/facilities">Facilities</Link>
          </nav>
        </div>
        {session.accountTier === "pilot" && (
          <span className="rounded-full bg-[var(--accent)]/20 px-3 py-1 text-xs text-[var(--accent)]">
            Pilot program
          </span>
        )}
      </header>
      {children}
    </div>
  );
}
