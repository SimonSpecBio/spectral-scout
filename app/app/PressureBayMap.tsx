import { SEVERITY_COLOR, type Severity } from "@/lib/colors";
import { BAYS, nearestBay } from "@/lib/floorplan-bays";
import { displayNameForPestSpecies } from "@/lib/treatments-catalog";
import BayBarMap from "./BayBarMap";

const SEVERITY_RANK: Record<Severity, number> = { low: 0, moderate: 1, high: 2, severe: 3 };
// Small, subtle labels (ticket request, 2026-09-04) -- a bay's bar is only
// 98px wide at zoom 1, so this keeps the combined label from ever visibly
// overflowing into the next bay's row even when two events share one bay.
const BADGE_MAX_CHARS = 22;

interface EventInput {
  id: string;
  facilityId: string;
  x: number;
  y: number;
  severity: Severity;
  pestSpecies: string;
}

// Joins every distinct pest name at one bay into a single short label,
// worst-severity name first (matches the bar's own color, which is also
// keyed off the worst severity there) -- truncates rather than wrapping to
// a second line, since there's no vertical room between bar rows for one.
function combineBadgeLabels(names: string[]): string {
  const joined = names.join(", ");
  if (joined.length <= BADGE_MAX_CHARS) return joined;
  let out = "";
  for (const name of names) {
    const next = out ? `${out}, ${name}` : name;
    if (next.length > BADGE_MAX_CHARS - 1) return `${out}…`;
    out = next;
  }
  return out;
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
  // A bay's bar links to whichever event set its color (the worst-severity
  // one there) -- if two events tie in severity at the same bay, the first
  // one seen wins; good enough since the bar can only ever point at one.
  const hrefByBay = new Map<string, string>();
  // Every distinct pest at a bay, not just the worst-severity one -- two
  // active events on the same bench (ticket request, 2026-09-04) both get
  // named in the label, worst severity first.
  const namesByBaySeverity = new Map<string, Map<string, Severity>>();
  for (const ev of events) {
    const bay = nearestBay(ev.x, ev.y);
    const key = `${bay.row}${bay.index}`;
    const existing = severityByBay.get(key);
    if (!existing || SEVERITY_RANK[ev.severity] > SEVERITY_RANK[existing]) {
      severityByBay.set(key, ev.severity);
      colorByBay.set(key, SEVERITY_COLOR[ev.severity]);
      hrefByBay.set(key, `/app/facilities/${ev.facilityId}/pest-events/${ev.id}`);
    }
    const name = displayNameForPestSpecies(ev.pestSpecies);
    const names = namesByBaySeverity.get(key) ?? new Map<string, Severity>();
    const existingSevForName = names.get(name);
    if (!existingSevForName || SEVERITY_RANK[ev.severity] > SEVERITY_RANK[existingSevForName]) names.set(name, ev.severity);
    namesByBaySeverity.set(key, names);
  }
  const badgeByBay = new Map<string, string>();
  for (const [key, names] of namesByBaySeverity) {
    const sorted = [...names.entries()].sort((a, b) => SEVERITY_RANK[b[1]] - SEVERITY_RANK[a[1]]).map(([name]) => name);
    badgeByBay.set(key, combineBadgeLabels(sorted));
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

  return <BayBarMap colorByBay={colorByBay} badgeByBay={badgeByBay} glowBar={glowBar} hrefByBay={hrefByBay} />;
}
