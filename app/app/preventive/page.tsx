import Link from "next/link";
import { preventiveChecklist } from "@/lib/preventive-checklist";
import { requireGrowerSession } from "@/lib/session";

export default async function PreventivePage() {
  const session = await requireGrowerSession();
  if (!session) return null;

  const checklist = preventiveChecklist();
  const pests = checklist.filter((c) => c.kind === "pest");
  const pathogens = checklist.filter((c) => c.kind === "pathogen");

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-6">
      <div>
        <Link href="/app" className="text-sm text-[var(--text-dim)]">
          ← Home
        </Link>
        <h1 className="text-2xl font-semibold">Preventive checklist</h1>
        <p className="mt-1 text-sm text-[var(--text-dim)]">
          No infestation history yet, so there&apos;s nothing personalized to show you -- these are the same early-warning
          signs and preventive practices the app recommends after a pest event, surfaced up front instead of only
          reactively.
        </p>
      </div>

      {pests.length > 0 && (
        <section className="flex flex-col gap-3">
          <span className="label-mono">Insects &amp; mites</span>
          <div className="card flex flex-col divide-y divide-[var(--border)]">
            {pests.map((c) => (
              <div key={c.pestId} className="flex flex-col gap-1.5 p-4">
                <div className="text-sm font-medium">{c.commonName}</div>
                <ul className="flex flex-col gap-1 text-sm text-[var(--text-dim)]">
                  {c.items.map((item, i) => (
                    <li key={i}>• {item}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      )}

      {pathogens.length > 0 && (
        <section className="flex flex-col gap-3">
          <span className="label-mono">Pathogens</span>
          <div className="card flex flex-col divide-y divide-[var(--border)]">
            {pathogens.map((c) => (
              <div key={c.pestId} className="flex flex-col gap-1.5 p-4">
                <div className="text-sm font-medium">{c.commonName}</div>
                <ul className="flex flex-col gap-1 text-sm text-[var(--text-dim)]">
                  {c.items.map((item, i) => (
                    <li key={i}>• {item}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
