import { eq } from "drizzle-orm";
import Link from "next/link";
import { db } from "@/db";
import { organizations } from "@/db/schema";
import { CONSENT_SECTIONS, CURRENT_CONSENT_VERSION } from "@/lib/consent";
import { requireGrowerSession } from "@/lib/session";

export const dynamic = "force-dynamic";

// Read-only review of what the org already agreed to -- re-consent only
// ever happens through proxy.ts's version-mismatch redirect to
// /app/onboarding, never from this page (see that file's comment).
export default async function LegalSettingsPage() {
  const session = await requireGrowerSession();
  if (!session) return null;

  const [org] = await db.select().from(organizations).where(eq(organizations.id, session.organizationId!));

  return (
    <div className="mx-auto flex max-w-md flex-col gap-6">
      <Link href="/app/settings" className="text-sm text-[var(--text-dim)]">
        &lsaquo; Settings
      </Link>
      <h1 className="text-2xl font-semibold">Data &amp; Privacy</h1>

      {org?.dataConsentVersion === CURRENT_CONSENT_VERSION && org.dataConsentAcceptedAt ? (
        <div className="label-mono">
          You accepted version {org.dataConsentVersion} on {new Date(org.dataConsentAcceptedAt).toLocaleDateString()}.
        </div>
      ) : (
        <div className="rounded-md p-3.5 text-sm" style={{ background: "var(--danger-bg)", color: "var(--danger)" }}>
          Not yet accepted for the current version -- you'll be asked to review this the next time you use the app.
        </div>
      )}

      <div className="card flex flex-col gap-4 p-4">
        {CONSENT_SECTIONS.map((section) => (
          <div key={section.heading} className="flex flex-col gap-1.5">
            <div className="text-sm font-medium">{section.heading}</div>
            {section.paragraphs.map((p, i) => (
              <p key={i} className="text-sm text-[var(--text-dim)]">
                {p}
              </p>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
