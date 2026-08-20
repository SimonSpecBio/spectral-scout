import Link from "next/link";
import { getOrgLogEntries, KIND_COLOR } from "@/lib/logs";
import { requireGrowerSession } from "@/lib/session";

export const dynamic = "force-dynamic";

const SCOPES = [
  { value: "all", label: "Whole org" },
  { value: "events", label: "Events" },
  { value: "treatments", label: "Treatments" },
] as const;

function dayLabel(date: Date): string {
  const now = new Date();
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffDays = Math.round((startOfDay(now).getTime() - startOfDay(date).getTime()) / 86_400_000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  return date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

// Org-wide narrative activity stream (19_timeline.svg) -- distinct from
// Logs (13), which is the filterable audit/compliance record. Same merged
// entries (lib/logs.ts), different framing: a scrollable rail, not a
// filter-heavy table.
export default async function TimelinePage({ searchParams }: { searchParams: Promise<{ scope?: string }> }) {
  const session = await requireGrowerSession();
  if (!session) return null;

  const { scope = "all" } = await searchParams;
  const entries = await getOrgLogEntries(session.organizationId!);
  const filtered =
    scope === "events"
      ? entries.filter((e) => e.kind === "finding" || e.kind === "disease")
      : scope === "treatments"
        ? entries.filter((e) => e.kind === "action")
        : entries;

  const grouped = new Map<string, typeof filtered>();
  for (const e of filtered) {
    const key = dayLabel(e.at);
    grouped.set(key, [...(grouped.get(key) ?? []), e]);
  }

  return (
    <div className="mx-auto flex max-w-md flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Timeline</h1>
        <p className="text-xs text-[var(--text-dim)]">Everything that happened, org-wide, as a scrollable narrative.</p>
      </div>

      <div className="flex gap-2">
        {SCOPES.map((s) => (
          <Link
            key={s.value}
            href={`/app/timeline?scope=${s.value}`}
            className={`rounded-full px-3 py-1.5 text-sm ${
              scope === s.value ? "bg-[var(--accent)] text-[var(--on-accent)]" : "card text-[var(--text-dim)]"
            }`}
          >
            {s.label}
          </Link>
        ))}
      </div>

      {grouped.size === 0 ? (
        <div className="card p-4 text-sm text-[var(--text-dim)]">Nothing yet.</div>
      ) : (
        [...grouped.entries()].map(([day, dayEntries]) => (
          <div key={day} className="flex flex-col gap-3">
            <span className="label-mono">{day.toUpperCase()}</span>
            <div className="flex flex-col">
              {dayEntries.map((e, i) => {
                const content = (
                  <div className="flex gap-3">
                    <div className="flex w-3 shrink-0 flex-col items-center">
                      <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: KIND_COLOR[e.kind] }} />
                      {i < dayEntries.length - 1 && <span className="mt-1 w-px flex-1" style={{ background: "var(--border-soft)" }} />}
                    </div>
                    <div className="flex flex-1 items-start justify-between pb-4">
                      <div>
                        <div className="text-sm">{e.label}</div>
                        <div className="label-mono">
                          {e.at.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", hour12: false })} · {e.sub}
                        </div>
                      </div>
                      {e.eventId && <span className="label-mono text-[var(--text-faint)]">PE-{e.eventId.slice(0, 4).toUpperCase()}</span>}
                    </div>
                  </div>
                );
                return e.facilityId && e.eventId ? (
                  <Link key={i} href={`/app/facilities/${e.facilityId}/pest-events/${e.eventId}`}>
                    {content}
                  </Link>
                ) : (
                  <div key={i}>{content}</div>
                );
              })}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
