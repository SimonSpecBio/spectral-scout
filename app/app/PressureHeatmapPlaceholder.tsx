import { BAYS, nearestBay } from "@/lib/floorplan-bays";

type Severity = "low" | "moderate" | "high" | "severe";
const SEVERITY_RANK: Record<Severity, number> = { low: 0, moderate: 1, high: 2, severe: 3 };
const SEVERITY_COLOR: Record<Severity, string> = {
  low: "#e0d24b",
  moderate: "#e0913d",
  high: "#e0553d",
  severe: "#a3193d",
};
const IDLE_FILL = "#172234";

interface EventInput {
  x: number;
  y: number;
  severity: Severity;
}

// Placeholder floor plan ("we'll come to the map fixing perfectly later"),
// but the colors are real: each event's stored (x, y) gets matched to its
// nearest of the 20 shared bay slots (lib/floorplan-bays.ts -- the same
// slots LocationPlacement writes to), and that bay's bar is colored by the
// worst severity of whatever landed there. A bay with nothing nearby stays
// idle. Same visual as before, no longer decorative.
export default function PressureHeatmapPlaceholder({ events }: { events: EventInput[] }) {
  const colorByBay = new Map<string, Severity>();
  for (const ev of events) {
    const bay = nearestBay(ev.x, ev.y);
    const key = `${bay.row}${bay.index}`;
    const existing = colorByBay.get(key);
    if (!existing || SEVERITY_RANK[ev.severity] > SEVERITY_RANK[existing]) colorByBay.set(key, ev.severity);
  }

  const rowA = BAYS.filter((b) => b.row === "A");
  const rowB = BAYS.filter((b) => b.row === "B");
  const barYs = [32, 60, 88, 116, 144, 172, 200, 228, 256, 284];

  const fillFor = (bay: (typeof BAYS)[number]) => {
    const sev = colorByBay.get(`${bay.row}${bay.index}`);
    return sev ? SEVERITY_COLOR[sev] : IDLE_FILL;
  };

  // Glow centers on the worst active hotspot, if any -- follows real data
  // instead of sitting on a hardcoded bar.
  let glowBar: { x: number; y: number } | null = null;
  let worst: Severity | null = null;
  for (const bay of [...rowA, ...rowB]) {
    const sev = colorByBay.get(`${bay.row}${bay.index}`);
    if (sev && (!worst || SEVERITY_RANK[sev] > SEVERITY_RANK[worst])) {
      worst = sev;
      const isRowA = bay.row === "A";
      const idx = (isRowA ? rowA : rowB).indexOf(bay);
      glowBar = { x: isRowA ? 99 : 223, y: barYs[idx] + 4 }; // row bar horizontal centers (x=50/174, width=98)
    }
  }

  return (
    <div className="overflow-hidden rounded-2xl" style={{ background: "#0a1120" }}>
      <svg viewBox="0 0 296 322" className="block w-full">
        <defs>
          <radialGradient id="heatGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.34" />
            <stop offset="55%" stopColor="var(--accent)" stopOpacity="0.08" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
          </radialGradient>
        </defs>
        {/* Row labels sit at each bar-pair's vertical center (same y as the
            gridlines below). */}
        <g fontFamily="ui-monospace, monospace" fontSize="7.5">
          <text x="16" y="54" fill="#374763">01</text>
          <text x="16" y="110" fill="#374763">02</text>
          <text x="16" y="166" fill="#374763">03</text>
          <text x="16" y="222" fill="#374763">04</text>
          <text x="16" y="278" fill="#374763">05</text>
        </g>
        <g stroke="#111c2d" strokeWidth="0.5">
          <line x1="14" y1="54" x2="284" y2="54" />
          <line x1="14" y1="110" x2="284" y2="110" />
          <line x1="14" y1="166" x2="284" y2="166" />
          <line x1="14" y1="222" x2="284" y2="222" />
          <line x1="14" y1="278" x2="284" y2="278" />
        </g>
        <rect x="38" y="18" width="246" height="288" rx="3" fill="none" stroke="#1e2c46" strokeWidth="1" />
        <line x1="161" y1="22" x2="161" y2="302" stroke="#111c2d" strokeWidth="0.75" strokeDasharray="1 5" />
        {glowBar && <circle cx={glowBar.x} cy={glowBar.y} r={62} fill="url(#heatGlow)" />}
        <g>
          {rowA.map((bay, i) => (
            <rect key={`A${bay.index}`} x="50" y={barYs[i]} width="98" height="8" rx="4" fill={fillFor(bay)} />
          ))}
          {rowB.map((bay, i) => (
            <rect key={`B${bay.index}`} x="174" y={barYs[i]} width="98" height="8" rx="4" fill={fillFor(bay)} />
          ))}
        </g>
        <g fontFamily="ui-monospace, monospace" fontSize="8" letterSpacing="0.14em">
          <text x="50" y="12" fill="#4a5a75">ROW A</text>
          <text x="174" y="12" fill="#4a5a75">ROW B</text>
        </g>
      </svg>
    </div>
  );
}
