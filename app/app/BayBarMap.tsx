import { BAYS } from "@/lib/floorplan-bays";

const IDLE_FILL = "var(--idle-fill)";

// The shared bay-bar canvas underneath every dashboard map lens (Pests,
// Last scouted, Temp, Humidity) -- same 20 shared bay slots, same layout,
// just a different fill/badge per bay depending which lens is selected.
// Extracted from what was PressureBayMap's pests-only rendering so the
// other three lenses don't reimplement this SVG from scratch.
export default function BayBarMap({
  colorByBay,
  badgeByBay,
  glowBar,
  legend,
}: {
  colorByBay: Map<string, string>;
  badgeByBay?: Map<string, string>;
  glowBar?: { x: number; y: number } | null;
  // Only meaningful for lenses where color alone carries the signal (the
  // Pests/severity lens) -- the other lenses already print a value badge
  // on each bar (temp/humidity/days-since-scouted), so color there is a
  // secondary cue, not the only one, and don't pass this.
  legend?: { label: string; color: string }[];
}) {
  const rowA = BAYS.filter((b) => b.row === "A");
  const rowB = BAYS.filter((b) => b.row === "B");
  const barYs = [32, 60, 88, 116, 144, 172, 200, 228, 256, 284];

  const fillFor = (bay: (typeof BAYS)[number]) => colorByBay.get(`${bay.row}${bay.index}`) ?? IDLE_FILL;
  const badgeFor = (bay: (typeof BAYS)[number]) => badgeByBay?.get(`${bay.row}${bay.index}`);

  return (
    <div className="flex flex-col gap-2">
      <div className="overflow-hidden" style={{ background: "var(--map-canvas-bg)", borderRadius: "var(--radius-md)" }}>
        <svg viewBox="0 0 296 322" className="block w-full">
          <defs>
            <radialGradient id="heatGlow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="var(--danger)" stopOpacity="0.34" />
              <stop offset="55%" stopColor="var(--danger)" stopOpacity="0.08" />
              <stop offset="100%" stopColor="var(--danger)" stopOpacity="0" />
            </radialGradient>
          </defs>
          <g fontFamily="ui-monospace, monospace" fontSize="7.5" fill="var(--map-label)">
            <text x="16" y="54">01</text>
            <text x="16" y="110">02</text>
            <text x="16" y="166">03</text>
            <text x="16" y="222">04</text>
            <text x="16" y="278">05</text>
          </g>
          <g stroke="var(--map-grid-stroke)" strokeWidth="0.5">
            <line x1="14" y1="82" x2="284" y2="82" />
            <line x1="14" y1="138" x2="284" y2="138" />
            <line x1="14" y1="194" x2="284" y2="194" />
            <line x1="14" y1="250" x2="284" y2="250" />
            <line x1="14" y1="306" x2="284" y2="306" />
          </g>
          <rect x="38" y="18" width="246" height="288" rx="3" fill="none" stroke="var(--map-frame-stroke)" strokeWidth="1" />
          <line x1="161" y1="22" x2="161" y2="302" stroke="var(--map-grid-stroke)" strokeWidth="0.75" strokeDasharray="1 5" />
          {glowBar && <circle cx={glowBar.x} cy={glowBar.y} r={62} fill="url(#heatGlow)" />}
          <g>
            {rowA.map((bay, i) => (
              <g key={`A${bay.index}`}>
                <rect x="50" y={barYs[i]} width="98" height="8" rx="4" fill={fillFor(bay)} />
                {badgeFor(bay) && (
                  <text x="144" y={barYs[i] - 2} fontFamily="ui-monospace, monospace" fontSize="7" fill="var(--map-label-dim)" textAnchor="end">
                    {badgeFor(bay)}
                  </text>
                )}
              </g>
            ))}
            {rowB.map((bay, i) => (
              <g key={`B${bay.index}`}>
                <rect x="174" y={barYs[i]} width="98" height="8" rx="4" fill={fillFor(bay)} />
                {badgeFor(bay) && (
                  <text x="268" y={barYs[i] - 2} fontFamily="ui-monospace, monospace" fontSize="7" fill="var(--map-label-dim)" textAnchor="end">
                    {badgeFor(bay)}
                  </text>
                )}
              </g>
            ))}
          </g>
          <g fontFamily="ui-monospace, monospace" fontSize="8" letterSpacing="0.14em" fill="var(--map-label)">
            <text x="50" y="12">ROW A</text>
            <text x="174" y="12">ROW B</text>
          </g>
        </svg>
      </div>
      {legend && legend.length > 0 && (
        <div className="flex flex-wrap justify-center gap-3 px-1">
          {legend.map((item) => (
            <span key={item.label} className="flex items-center gap-1.5 text-[9px] text-[var(--text-dim)]">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: item.color }} />
              {item.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
