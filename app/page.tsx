import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";

const VALUE_PROPS = [
  "Log scouting rounds and map hotspots in seconds",
  "Track treatments, REI/PHI, and inventory automatically",
  "Free, no card required.",
];

// Public landing page -- unlike the other three apps, this one is a
// self-serve free tool, so "/" has to work for a signed-out visitor instead
// of bouncing straight to sign-in. Already-signed-in visitors get routed
// to their actual app. Design pulled from the Spectral Biocontrol pitch
// deck (wordmark, checklist-style value props) but kept inside Scout's own
// light-mode token system -- Manrope, --accent -- so there's no jarring
// handoff once a visitor actually signs in.
export default async function Home() {
  const session = await auth();
  if (session?.role === "staff") redirect("/staff");
  if (session?.role === "grower") redirect("/app");

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-6 px-7 py-16 text-center sm:max-w-lg sm:gap-8">
      <img
        src="/spectral-biocontrol-wordmark.png"
        alt="Spectral Biocontrol"
        width={600}
        height={170}
        className="h-11 w-auto sm:h-14"
      />

      <div className="flex flex-col items-center gap-3 sm:gap-3.5">
        <h1 className="text-[34px] font-extrabold leading-[1.1] tracking-tight sm:text-[52px] sm:leading-[1.05]">Spectral Scout</h1>
        <p className="text-base leading-relaxed text-[var(--text-dim)] sm:max-w-[460px] sm:text-lg">
          Free pest scouting, hotspot monitoring, and treatment history for greenhouse and indoor growers.
        </p>
      </div>

      <div className="flex flex-col items-center gap-3 py-1">
        {VALUE_PROPS.map((prop) => (
          <div key={prop} className="flex items-center gap-2.5">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--accent-bg)] text-xs text-[var(--accent-text)] sm:h-[22px] sm:w-[22px] sm:text-[13px]">
              ✓
            </span>
            <span className="text-left text-sm text-[var(--text)] sm:text-[15px]">{prop}</span>
          </div>
        ))}
      </div>

      <div className="flex w-full flex-col items-center gap-4 sm:w-auto">
        <Link
          href="/api/auth/signin"
          className="w-full rounded-md bg-[var(--accent)] px-5 py-3.5 text-center font-medium text-[var(--on-accent)] sm:w-auto sm:py-2.5"
        >
          Sign in
        </Link>
        {/* One shared, always-onboarded account -- no signup, no real
            email, just straight into a working app with sample data.
            Deliberately de-emphasized vs. the real Sign in button above.
            A plain <a href>, not next/link's <Link> or a <form> submit --
            this needs to be a real, crawlable link a script or AI agent
            can follow with a bare GET, not something that only works via
            a simulated form submission or client-side route interception. */}
        <a href="/api/demo-login" className="text-xs text-[var(--text-dim)] underline">
          Just want to poke around? Try the test account →
        </a>
        <p className="max-w-[420px] text-xs leading-relaxed text-[var(--text-faint)]">
          Built by{" "}
          <a href="https://spectralbiocontrol.com" className="text-[var(--text-dim)] underline">
            Spectral Biocontrol
          </a>
          . Log your pest pressure here, automate your IPM with Spectral&apos;s Pesticidal Light Systems.
        </p>
      </div>
    </main>
  );
}
