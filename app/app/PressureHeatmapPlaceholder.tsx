// Static placeholder, per explicit instruction -- not wired to real zone/
// row data yet ("we'll come to the map fixing perfectly later"). The real
// interactive map (drag/drop editing, real pest pins) still lives on
// desktop and on the site/area detail pages; this only stands in for the
// mobile home-screen visual until the real row/bay data model exists.
export default function PressureHeatmapPlaceholder() {
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
            gridlines below) -- the original y-6 offset put them visually a
            row high, floating over the pair above the one they labeled. */}
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
        <circle cx="88" cy="46" r="62" fill="url(#heatGlow)" />
        <g>
          <rect x="50" y="32" width="98" height="8" rx="4" fill="var(--accent)" />
          <rect x="50" y="60" width="98" height="8" rx="4" fill="#4a2a22" />
          {[88, 116, 144, 172, 200, 228, 256, 284].map((y) => (
            <rect key={y} x="50" y={y} width="98" height="8" rx="4" fill="#172234" />
          ))}
          {[32, 60, 88, 116, 144].map((y) => (
            <rect key={y} x="174" y={y} width="98" height="8" rx="4" fill="#172234" />
          ))}
          <rect x="174" y="172" width="98" height="8" rx="4" fill="#3a3220" />
          {[200, 228, 256, 284].map((y) => (
            <rect key={y} x="174" y={y} width="98" height="8" rx="4" fill="#172234" />
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
