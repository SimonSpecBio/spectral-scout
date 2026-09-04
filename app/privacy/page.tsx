import Link from "next/link";
import { CONSENT_SECTIONS, CURRENT_CONSENT_VERSION } from "@/lib/consent";

export const metadata = { title: "Privacy Policy — Spectral Scout" };

// Public mirror of the same CONSENT_SECTIONS shown in the signed-in
// Settings > Data & Privacy page (app/app/settings/legal/page.tsx) and the
// onboarding consent modal -- this copy exists so Google's OAuth consent
// screen (and anyone else) can link a privacy policy without requiring a
// session, which that page does. Never let this drift from that content;
// CONSENT_SECTIONS is the single shared source for both.
export default function PrivacyPolicyPage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-6 px-6 py-12">
      <Link href="/" className="text-sm text-[var(--text-dim)]">
        &lsaquo; Spectral Scout
      </Link>
      <div className="flex flex-col gap-1.5">
        <h1 className="text-2xl font-semibold">Privacy Policy</h1>
        <p className="text-sm text-[var(--text-dim)]">Version {CURRENT_CONSENT_VERSION}</p>
      </div>

      <div className="flex flex-col gap-6">
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
    </main>
  );
}
