import Link from "next/link";
import { redirect } from "next/navigation";
import { signOutAction } from "@/lib/auth-actions";
import { requireStaffSession } from "@/lib/session";

export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  const session = await requireStaffSession();
  if (!session) redirect("/");

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <header className="mb-8 flex items-center gap-5">
        <span className="font-semibold">Spectral Scout · Staff</span>
        <Link href="/staff" className="text-sm text-[var(--text-dim)]">
          Organizations
        </Link>
        <Link href="/staff/escalations" className="text-sm text-[var(--text-dim)]">
          Ask a person
        </Link>
        <form action={signOutAction} className="ml-auto">
          <button type="submit" className="text-sm text-[var(--text-dim)]">
            Sign out
          </button>
        </form>
      </header>
      {children}
    </div>
  );
}
