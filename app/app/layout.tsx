import { redirect } from "next/navigation";
import { requireGrowerSession } from "@/lib/session";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await requireGrowerSession();
  if (!session) redirect("/");

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <header className="mb-8 flex items-center justify-between">
        <span className="font-semibold">Spectral Scout</span>
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
