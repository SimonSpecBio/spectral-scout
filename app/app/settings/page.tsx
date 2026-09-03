import { eq } from "drizzle-orm";
import Link from "next/link";
import { db } from "@/db";
import { memberships } from "@/db/schema";
import { requireGrowerSession } from "@/lib/session";
import AccountData from "./AccountData";
import NotificationsToggle from "./NotificationsToggle";
import ThemeToggle from "./ThemeToggle";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const session = await requireGrowerSession();
  if (!session) return null;

  // Mirrors app/api/account's own last-owner guard exactly, computed here
  // just to decide whether to show the blocked-state copy up front instead
  // of only after a failed delete attempt.
  const orgMemberships = await db.select().from(memberships).where(eq(memberships.organizationId, session.organizationId!));
  const isOwner = session.membershipRole === "owner";
  const otherMemberships = orgMemberships.filter((m) => m.userId !== session.user!.id!);
  const blockedAsOnlyOwner = isOwner && otherMemberships.length > 0 && !otherMemberships.some((m) => m.role === "owner");

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-6">
      <h1 className="text-2xl font-semibold">Settings</h1>

      <ThemeToggle />
      <NotificationsToggle />

      <div className="card flex flex-col divide-y divide-[var(--border)]">
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

      <AccountData isOwner={isOwner} blockedAsOnlyOwner={blockedAsOnlyOwner} />
    </div>
  );
}
