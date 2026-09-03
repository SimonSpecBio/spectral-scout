import Link from "next/link";
import { getOrgLogEntries, KIND_COLOR } from "@/lib/logs";
import { requireGrowerSession } from "@/lib/session";

export const dynamic = "force-dynamic";

// Simon's taxonomy decision (2026-09-03, resolving the ambiguity Airtable
// ticket B8 originally flagged): three real categories everywhere activity
// is grouped -- Events, Treatments, Monitoring. A resolved event now counts
// as an Event, not a Treatment; a completed task and a real chemical/
// biological/spectral application both count as a Treatment (lib/logs.ts's
// LogKind mirrors these three names directly).
const SCOPES = [
  { value: "all", label: "Whole org" },
  { value: "events", label: "Events" },
  { value: "treatments", label: "Treatments" },
  { value: "monitoring", label: "Monitoring" },
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
      ? entries.filter((e) => e.kind === "event")
      : scope === "treatments"
        ? entries.filter((e) => e.kind === "treatment")
        : scope === "monitoring"
          ? entries.filter((e) => e.kind === "monitoring")
          : entries;

  const grouped = new Map<string, typeof filtered>();
  for (const e of filtered) {
    const key = dayLabel(e.at);
    grouped.set(key, [...(grouped.get(key) ?? []), e]);
  }

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Timeline</h1>
      </div>

      <div className="hide-scrollbar flex gap-2 overflow-x-auto">
        {SCOPES.map((s) => (
          <Link
            key={s.value}
            href={`/app/timeline?scope=${s.value}`}
            className={`shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-sm ${
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
                          {e.at.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit", hour12: true })} · {e.sub}
                        </div>
                      </div>
                      {e.eventId && <span className="label-mono text-[var(--text-faint)]">PE-{e.eventId.slice(0, 4).toUpperCase()}</span>}
                    </div>
                  </div>
                );
                // A standalone applied treatment, or a monitoring session
                // that never promoted into an event, has nowhere event-
                // specific to land -- the facility itself is still a real,
                // useful destination rather than leaving the entry dead
                // (ticket B8; previously required BOTH ids, so these two
                // cases were stuck unclickable even though facilityId was
                // already known).
                const href = e.facilityId
                  ? e.eventId
                    ? `/app/facilities/${e.facilityId}/pest-events/${e.eventId}`
                    : `/app/facilities/${e.facilityId}`
                  : null;
                return href ? (
                  <Link key={i} href={href}>
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
