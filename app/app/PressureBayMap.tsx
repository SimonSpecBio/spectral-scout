import { SEVERITY_COLOR, type Severity } from "@/lib/colors";
import { BAYS, nearestBay } from "@/lib/floorplan-bays";
import BayBarMap from "./BayBarMap";

const SEVERITY_RANK: Record<Severity, number> = { low: 0, moderate: 1, high: 2, severe: 3 };
const SEVERITY_LEGEND = (Object.keys(SEVERITY_RANK) as Severity[])
  .sort((a, b) => SEVERITY_RANK[a] - SEVERITY_RANK[b])
  .map((s) => ({ label: s[0].toUpperCase() + s.slice(1), color: SEVERITY_COLOR[s] }));

interface EventInput {
  x: number;
  y: number;
  severity: Severity;
}

// The "Pests" lens (the default/only lens before the switcher existed):
// each event's stored (x, y) gets matched to its nearest of the 20 shared
// bay slots (lib/floorplan-bays.ts -- the same slots LocationPicker
// writes to), and that bay's bar is colored by the worst severity of
// whatever landed there. This is real event data, not a mock -- but the
// 20 bay slots are a generic layout shared by every facility, not that
// facility's actual floor plan, so MapLensSwitcher labels it as such.
// Rendering itself now lives in BayBarMap, shared with the other map
// lenses (see MapLensSwitcher).
export default function PressureBayMap({ events }: { events: EventInput[] }) {
  const colorByBay = new Map<string, string>();
  const severityByBay = new Map<string, Severity>();
  for (const ev of events) {
    const bay = nearestBay(ev.x, ev.y);
    const key = `${bay.row}${bay.index}`;
    const existing = severityByBay.get(key);
    if (!existing || SEVERITY_RANK[ev.severity] > SEVERITY_RANK[existing]) {
      severityByBay.set(key, ev.severity);
      colorByBay.set(key, SEVERITY_COLOR[ev.severity]);
    }
  }

  // Glow centers on the worst active hotspot, if any -- follows real data
  // instead of sitting on a hardcoded bar.
  let glowBar: { x: number; y: number } | null = null;
  let worst: Severity | null = null;
  const rowA = BAYS.filter((b) => b.row === "A");
  const rowB = BAYS.filter((b) => b.row === "B");
  const barYs = [32, 60, 88, 116, 144, 172, 200, 228, 256, 284];
  for (const bay of [...rowA, ...rowB]) {
    const sev = severityByBay.get(`${bay.row}${bay.index}`);
    if (sev && (!worst || SEVERITY_RANK[sev] > SEVERITY_RANK[worst])) {
      worst = sev;
      const isRowA = bay.row === "A";
      const idx = (isRowA ? rowA : rowB).indexOf(bay);
      glowBar = { x: isRowA ? 99 : 223, y: barYs[idx] + 4 }; // row bar horizontal centers (x=50/174, width=98)
    }
  }

  return <BayBarMap colorByBay={colorByBay} glowBar={glowBar} legend={SEVERITY_LEGEND} />;
}
