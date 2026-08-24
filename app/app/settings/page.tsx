import Link from "next/link";
import { requireGrowerSession } from "@/lib/session";
import NotificationsToggle from "./NotificationsToggle";
import ThemeToggle from "./ThemeToggle";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const session = await requireGrowerSession();
  if (!session) return null;

  return (
    <div className="mx-auto flex max-w-md flex-col gap-6">
      <h1 className="text-2xl font-semibold">Settings</h1>

      <ThemeToggle />
      <NotificationsToggle />

      <div className="card flex flex-col divide-y divide-[var(--border)]">
        <Link href="/app/settings/catalog" className="flex items-center justify-between p-4 text-sm">
          Species &amp; thresholds
          <span className="text-[var(--text-faint)]">&rsaquo;</span>
        </Link>
        <Link href="/app/team" className="flex items-center justify-between p-4 text-sm">
          Team
          <span className="text-[var(--text-faint)]">&rsaquo;</span>
        </Link>
        <Link href="/app/settings/legal" className="flex items-center justify-between p-4 text-sm">
          Data &amp; Privacy
          <span className="text-[var(--text-faint)]">&rsaquo;</span>
        </Link>
        <Link href="/app/settings/grow-setup" className="flex items-center justify-between p-4 text-sm">
          About your grow
          <span className="text-[var(--text-faint)]">&rsaquo;</span>
        </Link>
      </div>
    </div>
  );
}
