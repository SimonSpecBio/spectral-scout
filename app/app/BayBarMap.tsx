import { BAYS } from "@/lib/floorplan-bays";

const IDLE_FILL = "#172234";

// The shared bay-bar canvas underneath every dashboard map lens (Pests,
// Last scouted, Temp, Humidity) -- same 20 shared bay slots, same layout,
// just a different fill/badge per bay depending which lens is selected.
// Extracted from what was PressureHeatmapPlaceholder's pests-only rendering
// so the other three lenses don't reimplement this SVG from scratch.
export default function BayBarMap({
  colorByBay,
  badgeByBay,
  glowBar,
}: {
  colorByBay: Map<string, string>;
  badgeByBay?: Map<string, string>;
  glowBar?: { x: number; y: number } | null;
}) {
  const rowA = BAYS.filter((b) => b.row === "A");
  const rowB = BAYS.filter((b) => b.row === "B");
  const barYs = [32, 60, 88, 116, 144, 172, 200, 228, 256, 284];

  const fillFor = (bay: (typeof BAYS)[number]) => colorByBay.get(`${bay.row}${bay.index}`) ?? IDLE_FILL;
  const badgeFor = (bay: (typeof BAYS)[number]) => badgeByBay?.get(`${bay.row}${bay.index}`);

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
            <g key={`A${bay.index}`}>
              <rect x="50" y={barYs[i]} width="98" height="8" rx="4" fill={fillFor(bay)} />
              {badgeFor(bay) && (
                <text x="144" y={barYs[i] - 2} fontFamily="ui-monospace, monospace" fontSize="7" fill="#6B7A90" textAnchor="end">
                  {badgeFor(bay)}
                </text>
              )}
            </g>
          ))}
          {rowB.map((bay, i) => (
            <g key={`B${bay.index}`}>
              <rect x="174" y={barYs[i]} width="98" height="8" rx="4" fill={fillFor(bay)} />
              {badgeFor(bay) && (
                <text x="268" y={barYs[i] - 2} fontFamily="ui-monospace, monospace" fontSize="7" fill="#6B7A90" textAnchor="end">
                  {badgeFor(bay)}
                </text>
              )}
            </g>
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
