import Link from "next/link";
import { getOrgLogEntries, KIND_COLOR, type LogKind } from "@/lib/logs";
import { requireGrowerSession } from "@/lib/session";

export const dynamic = "force-dynamic";

const KINDS: { value: LogKind | "all"; label: string }[] = [
  { value: "all", label: "All types" },
  { value: "event", label: "Events" },
  { value: "treatment", label: "Treatments" },
  { value: "monitoring", label: "Monitoring" },
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
export default async function LogsPage({ searchParams }: { searchParams: Promise<{ type?: string; from?: string; to?: string }> }) {
  const session = await requireGrowerSession();
  if (!session) return null;

  const { type = "all", from, to } = await searchParams;
  const entries = await getOrgLogEntries(session.organizationId!);
  let filtered = type === "all" ? entries : entries.filter((e) => e.kind === type);
  if (from) filtered = filtered.filter((e) => e.at >= new Date(from + "T00:00:00"));
  if (to) filtered = filtered.filter((e) => e.at <= new Date(to + "T23:59:59.999"));

  const exportParams = new URLSearchParams({ type });
  if (from) exportParams.set("from", from);
  if (to) exportParams.set("to", to);

  const grouped = new Map<string, typeof filtered>();
  for (const e of filtered) {
    const key = dayLabel(e.at);
    grouped.set(key, [...(grouped.get(key) ?? []), e]);
  }

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Logs</h1>
      </div>

      <div className="flex flex-wrap gap-2">
        {KINDS.map((k) => (
          <Link
            key={k.value}
            href={`/app/logs?type=${k.value}${from ? `&from=${from}` : ""}${to ? `&to=${to}` : ""}`}
            className={`rounded-full px-3 py-1.5 text-xs ${
              type === k.value ? "bg-[var(--accent)] text-[var(--on-accent)]" : "card text-[var(--text-dim)]"
            }`}
          >
            {k.label}
          </Link>
        ))}
      </div>

      <form className="flex flex-col gap-3" method="GET">
        <div className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="type" value={type} />
          <label className="flex flex-col gap-1 text-xs text-[var(--text-dim)]">
            From
            <input
              type="date"
              name="from"
              defaultValue={from}
              className="w-[9.5rem] rounded-md border border-[var(--border)] bg-transparent px-2 py-1.5 text-sm"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-[var(--text-dim)]">
            To
            <input
              type="date"
              name="to"
              defaultValue={to}
              className="w-[9.5rem] rounded-md border border-[var(--border)] bg-transparent px-2 py-1.5 text-sm"
            />
          </label>
          <button type="submit" className="rounded-md border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--text-dim)]">
            Apply
          </button>
        </div>
        <a
          href={`/api/logs/export?${exportParams.toString()}`}
          className="self-center rounded-md bg-[var(--accent)] px-3 py-1.5 text-sm font-medium text-[var(--on-accent)]"
        >
          Export CSV
        </a>
      </form>

      {grouped.size === 0 ? (
        <div className="card p-6 text-sm text-[var(--text-dim)]">Nothing logged yet.</div>
      ) : (
        [...grouped.entries()].map(([day, dayEntries]) => (
          <div key={day} className="flex flex-col gap-2">
            <div className="label-mono">{day.toUpperCase()}</div>
            <div className="card flex flex-col divide-y divide-[var(--border)]">
              {dayEntries.map((e, i) => (
                <div key={i} className="flex items-start gap-3 p-3.5">
                  <span className="mt-1 w-14 shrink-0 whitespace-nowrap label-mono">
                    {e.at.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit", hour12: true })}
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
        {(["event", "treatment", "monitoring"] as const).map((k) => (
          <div key={k} className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: KIND_COLOR[k] }} />
            <span className="label-mono">{k}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
