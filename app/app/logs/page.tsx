import Link from "next/link";
import { getOrgLogEntries, KIND_COLOR, type LogKind } from "@/lib/logs";
import { requireGrowerSession } from "@/lib/session";

export const dynamic = "force-dynamic";

const KINDS: { value: LogKind | "all"; label: string }[] = [
  { value: "all", label: "All types" },
  { value: "finding", label: "Findings" },
  { value: "monitor", label: "Monitoring" },
  { value: "action", label: "Actions" },
  { value: "disease", label: "Disease" },
];

function dayLabel(date: Date): string {
  const now = new Date();
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffDays = Math.round((startOfDay(now).getTime() - startOfDay(date).getTime()) / 86_400_000);
  if (diffDays === 0) return `Today · ${date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}`;
  if (diffDays === 1) return `Yesterday · ${date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}`;
  return date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

// The filterable, bay-keyed compliance/audit record (13_logs_history.svg)
// -- distinct from Timeline (19), which is a narrative feed. See
// lib/logs.ts for how every capture surface merges into one list here.
export default async function LogsPage({ searchParams }: { searchParams: Promise<{ type?: string }> }) {
  const session = await requireGrowerSession();
  if (!session) return null;

  const { type = "all" } = await searchParams;
  const entries = await getOrgLogEntries(session.organizationId!);
  const filtered = type === "all" ? entries : entries.filter((e) => e.kind === type);

  const grouped = new Map<string, typeof filtered>();
  for (const e of filtered) {
    const key = dayLabel(e.at);
    grouped.set(key, [...(grouped.get(key) ?? []), e]);
  }

  return (
    <div className="mx-auto flex max-w-md flex-col gap-6">
      <h1 className="text-2xl font-semibold">Logs</h1>

      <div className="flex flex-wrap gap-2">
        {KINDS.map((k) => (
          <Link
            key={k.value}
            href={`/app/logs?type=${k.value}`}
            className={`rounded-full px-3 py-1.5 text-xs ${
              type === k.value ? "bg-[var(--accent)] text-[var(--on-accent)]" : "card text-[var(--text-dim)]"
            }`}
          >
            {k.label}
          </Link>
        ))}
      </div>

      {grouped.size === 0 ? (
        <div className="card p-6 text-sm text-[var(--text-dim)]">Nothing logged yet.</div>
      ) : (
        [...grouped.entries()].map(([day, dayEntries]) => (
          <div key={day} className="flex flex-col gap-2">
            <div className="label-mono">{day.toUpperCase()}</div>
            <div className="card flex flex-col divide-y divide-[var(--border)]">
              {dayEntries.map((e, i) => (
                <div key={i} className="flex items-start gap-3 p-3.5">
                  <span className="mt-1 w-11 shrink-0 label-mono">
                    {e.at.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", hour12: false })}
                  </span>
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: KIND_COLOR[e.kind] }} />
                  <div className="flex-1">
                    <div className="text-sm">{e.label}</div>
                    <div className="label-mono">{e.sub}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))
      )}

      <div className="flex flex-wrap gap-4 border-t border-[var(--border)] pt-4">
        {(["finding", "monitor", "action", "disease"] as const).map((k) => (
          <div key={k} className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: KIND_COLOR[k] }} />
            <span className="label-mono">{k}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
