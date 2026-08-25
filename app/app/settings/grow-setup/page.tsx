import { eq } from "drizzle-orm";
import Link from "next/link";
import { db } from "@/db";
import { organizations } from "@/db/schema";
import { requireGrowerSession } from "@/lib/session";
import GrowSetupForm from "./GrowSetupForm";

export const dynamic = "force-dynamic";

// Owner-only settings, entirely optional -- never part of the mandatory
// onboarding gate. Per Simon's direct call (2026-08-22): asking a home
// cannabis grower to state this at signup, before they've built any trust
// in the app, risks making some uncomfortable given legal plant-count
// limits in many states -- so this lives here instead, for whenever a
// grower wants to personalize their recommendations.
export default async function GrowSetupPage() {
  const session = await requireGrowerSession();
  if (!session) return null;

  const [org] = await db.select().from(organizations).where(eq(organizations.id, session.organizationId!));

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-6">
      <Link href="/app/settings" className="text-sm text-[var(--text-dim)]">
        &lsaquo; Settings
      </Link>
      <div>
        <h1 className="text-2xl font-semibold">About your grow</h1>
        <p className="mt-1 text-sm text-[var(--text-dim)]">
          Optional -- helps us show simpler, more relevant recommendations for smaller setups. Never required, and you
          can change or clear this anytime.
        </p>
      </div>
      <GrowSetupForm
        isOwner={session.membershipRole === "owner"}
        initialGrowerType={org?.growerType ?? null}
        initialGrowSizeLabel={org?.growSizeLabel ?? ""}
      />
    </div>
  );
}
