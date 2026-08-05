import { sparkPoints } from "@/lib/density";

type Severity = "low" | "moderate" | "high" | "severe";
const SEVERITY_WEIGHT: Record<Severity, number> = { low: 1, moderate: 2, high: 3, severe: 4 };
const DAY_MS = 86_400_000;

interface EventInput {
  createdAt: Date;
  resolvedAt: Date | null;
  severity: Severity;
}

// Real reconstruction, not fabricated: for each of the last 7 days, sum the
// severity weight of every event that was active on that day (created by
// end of day, not yet resolved by start of day) using pest_events' actual
// timestamps. No made-up "threshold" line -- there's no real economic-
// threshold concept in the data yet, so this only shows what's actually
// knowable: the trend itself, and the change over the window.
export default function PressureGraph({ events }: { events: EventInput[] }) {
  const today = new Date();
  today.setHours(23, 59, 59, 999);

  const days: number[] = [];
  for (let i = 6; i >= 0; i--) {
    const dayEnd = new Date(today.getTime() - i * DAY_MS);
    const dayStart = new Date(dayEnd);
    dayStart.setHours(0, 0, 0, 0);
    const pressure = events
      .filter((e) => e.createdAt <= dayEnd && (e.resolvedAt == null || e.resolvedAt >= dayStart))
      .reduce((sum, e) => sum + SEVERITY_WEIGHT[e.severity], 0);
    days.push(pressure);
  }

  const latest = days[days.length - 1];
  const weekAgo = days[0];
  const delta = latest - weekAgo;
  const max = Math.max(...days, 1);

  return (
    <div className="card p-4">
      <div className="mb-2 flex items-center justify-between">
        <span className="label-mono">Pest pressure &middot; 7D</span>
        {delta !== 0 && (
          <span className="label-mono" style={{ color: delta > 0 ? "var(--accent)" : "#7fb87a" }}>
            {delta > 0 ? "▲" : "▼"} {Math.abs(delta)} vs last week
          </span>
        )}
      </div>
      <svg viewBox="0 0 252 60" className="block w-full">
        <g fontFamily="ui-monospace, monospace" fontSize="8" fill="#374763">
          <text x="0" y="12">{max}</text>
          <text x="0" y="56">0</text>
        </g>
        <g stroke="#111c2d" strokeWidth="0.5">
          <line x1="22" y1="8" x2="252" y2="8" />
          <line x1="22" y1="52" x2="252" y2="52" />
        </g>
        <polyline
          points={sparkPoints(days, 226, 44, 4)}
          fill="none"
          stroke="var(--accent)"
          strokeWidth="1"
          strokeLinecap="round"
          strokeLinejoin="round"
          transform="translate(22, 4)"
        />
      </svg>
    </div>
  );
}
