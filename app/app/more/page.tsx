import Link from "next/link";
import { requireGrowerSession } from "@/lib/session";

const COMING_SOON = ["Monitoring protocols", "Treatments library", "Reports / export", "Analytics", "Settings"];

// On mobile/tablet, BottomNav replaces the hamburger for the 4 main
// destinations, but HeaderMenu's account/sign-out entry point disappears
// with it there -- this is where it lives instead. Desktop still has both
// (HeaderMenu's copy is redundant but harmless).
export default async function MorePage() {
  const session = await requireGrowerSession();

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">More</h1>

      <Link href="/app/facilities" className="card card-interactive flex items-center justify-between p-4">
        <span>Sites</span>
        <span className="text-[var(--text-dim)]">→</span>
      </Link>

      <Link href="/app/traps" className="card card-interactive flex items-center justify-between p-4">
        <span>Sticky traps</span>
        <span className="text-[var(--text-dim)]">→</span>
      </Link>

      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-medium text-[var(--text-dim)]">Coming soon</h2>
        {COMING_SOON.map((item) => (
          <div key={item} className="card flex items-center justify-between p-4 text-[var(--text-dim)]">
            <span>{item}</span>
          </div>
        ))}
      </div>

      {session && (
        <div className="card flex flex-col gap-2 p-4">
          <h2 className="text-sm font-medium text-[var(--text-dim)]">Account</h2>
          {session.user?.email && <div className="text-sm text-[var(--text-dim)]">{session.user.email}</div>}
          <Link href="/api/auth/signout" className="text-sm text-[var(--accent)]">
            Sign out
          </Link>
        </div>
      )}
    </div>
  );
}
