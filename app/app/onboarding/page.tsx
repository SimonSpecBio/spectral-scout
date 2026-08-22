import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { organizations } from "@/db/schema";
import { CURRENT_CONSENT_VERSION } from "@/lib/consent";
import { requireGrowerSession } from "@/lib/session";
import OnboardingForm from "./OnboardingForm";

// Gated to here by proxy.ts whenever a grower/owner's org has no state set,
// or hasn't accepted the current data-consent version, yet -- see that
// file's comment. Members never land here (only the owner is on the hook),
// and an owner who's already fully done with both gets bounced back to the
// dashboard rather than re-shown a stale form. An owner whose org already
// has a name/state (an existing org catching up to the consent gate after
// it shipped) skips straight to just the consent step -- OnboardingForm
// decides which mode to render based on needsProfile below.
export default async function OnboardingPage() {
  const session = await requireGrowerSession();
  if (!session) return null;
  if (session.membershipRole !== "owner") redirect("/app");

  const [org] = await db.select().from(organizations).where(eq(organizations.id, session.organizationId!));
  if (!org) redirect("/app");
  if (org.state && org.dataConsentVersion === CURRENT_CONSENT_VERSION) redirect("/app");

  const needsProfile = !org.state;

  return (
    <div className="mx-auto flex max-w-md flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">{needsProfile ? "Welcome to Spectral Scout" : "One more thing"}</h1>
        <p className="mt-1 text-sm text-[var(--text-dim)]">
          {needsProfile
            ? "A couple quick details before you get started -- this is what lets us show you the right compliance info for your state."
            : "We've updated our data agreement -- please review and accept to keep using Spectral Scout."}
        </p>
      </div>
      <OnboardingForm initialName={org.name} needsProfile={needsProfile} />
    </div>
  );
}
