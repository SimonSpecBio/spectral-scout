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
  createdAt: string; // ISO
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
interface SpreadHistoryEvent {
  x: number;
  y: number;
  pestSpecies: string;
  createdAt: string; // ISO
}

export default function PressureBayMap({
  events,
  spreadHistoryEvents,
}: {
  events: EventInput[];
  // Includes resolved cases -- one open case per pest per area is enforced
  // (db/schema.ts's scout_pest_event_open_case_idx), so by the time the
  // same pest resurfaces at a different bay, the earlier case has almost
  // always already resolved. The active-only `events` above can't show
  // that chain on its own.
  spreadHistoryEvents: SpreadHistoryEvent[];
}) {
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
  const centerOf = (bay: { row: "A" | "B"; index: number }): { x: number; y: number } => {
    const idx = (bay.row === "A" ? rowA : rowB).findIndex((b) => b.index === bay.index);
    return { x: bay.row === "A" ? 99 : 223, y: barYs[idx] + 4 }; // row bar horizontal centers (x=50/174, width=98)
  };
  for (const bay of [...rowA, ...rowB]) {
    const sev = severityByBay.get(`${bay.row}${bay.index}`);
    if (sev && (!worst || SEVERITY_RANK[sev] > SEVERITY_RANK[worst])) {
      worst = sev;
      glowBar = centerOf(bay);
    }
  }

  // Cross-bench spread arrows (Simon, live feedback, 2026-09-07: "if a pest
  // event happened on Monday on a bench, then another one happens at a
  // later time on the next bench over and it's the same pest or pathogen,
  // on the main map there should automatically be a little dotted line and
  // arrow showing how the pest is spreading"). Grouped by species, sorted
  // chronologically, one arrow per consecutive step to a DIFFERENT bay --
  // traces the path an outbreak actually walked, not every pair.
  //
  // Time-gated (MAX_GAP_DAYS), not just capped by count -- a real
  // production account (Simon, live feedback, 2026-09-07: "these lines on
  // the map seem totally random and not related to anything") had the same
  // pest species recur independently across unrelated weeks-apart
  // outbreaks in totally different bays (normal recurring-pest behavior,
  // not one outbreak spreading), and connecting every historical
  // recurrence read as arrows appearing "from nowhere." Same 7-day window
  // as RECENTLY_TREATED_DAYS elsewhere in the app (MapEditor.tsx) for
  // "recent enough to still be the same episode." A gap longer than that
  // breaks the chain -- it doesn't stop a later, closely-timed pair from
  // still connecting.
  const MAX_GAP_DAYS = 7;
  const MAX_GAP_MS = MAX_GAP_DAYS * 86_400_000;
  const bySpecies = new Map<string, SpreadHistoryEvent[]>();
  for (const ev of spreadHistoryEvents) {
    const list = bySpecies.get(ev.pestSpecies) ?? [];
    list.push(ev);
    bySpecies.set(ev.pestSpecies, list);
  }
  const spreadEdges: { x1: number; y1: number; x2: number; y2: number }[] = [];
  for (const evs of bySpecies.values()) {
    if (evs.length < 2) continue;
    const sorted = [...evs].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    let prevKey: string | null = null;
    let prevCenter: { x: number; y: number } | null = null;
    let prevTime: number | null = null;
    for (const ev of sorted) {
      const bay = nearestBay(ev.x, ev.y);
      const key = `${bay.row}${bay.index}`;
      const center = centerOf(bay);
      const time = new Date(ev.createdAt).getTime();
      if (prevKey && prevKey !== key && prevCenter && prevTime != null && time - prevTime <= MAX_GAP_MS) {
        spreadEdges.push({ x1: prevCenter.x, y1: prevCenter.y, x2: center.x, y2: center.y });
      }
      prevKey = key;
      prevCenter = center;
      prevTime = time;
    }
  }

  return <BayBarMap colorByBay={colorByBay} badgeByBay={badgeByBay} glowBar={glowBar} hrefByBay={hrefByBay} spreadEdges={spreadEdges} />;
}
