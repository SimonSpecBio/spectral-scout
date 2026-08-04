// Soft, desaturated per-species colors -- distinct from severity color
// (SEVERITY_COLOR elsewhere answers "how bad," this answers "which pest,"
// e.g. scanning a map full of pins by eye). Curated for the pests growers
// actually type most often; anything else gets a deterministic hash into
// the same palette family so it's still stable and visually consistent
// rather than falling back to a single generic gray.
const CURATED: Record<string, string> = {
  "spider mites": "#d9a441", // warm amber
  "spider mite": "#d9a441",
  mites: "#d9a441",
  thrips: "#5b93c9", // cool blue
  aphids: "#7fb87a", // sage green
  aphid: "#7fb87a",
  whitefly: "#c9c15b", // muted yellow
  whiteflies: "#c9c15b",
  "fungus gnats": "#8a7bc9", // soft violet
  "powdery mildew": "#c97bb0", // dusty pink
  "botrytis": "#a35b5b", // muted red
  "root aphids": "#5bb0a3", // teal
};

const PALETTE = ["#d9a441", "#5b93c9", "#7fb87a", "#c9c15b", "#8a7bc9", "#c97bb0", "#5bb0a3", "#a35b5b"];

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

export function speciesColor(species: string): string {
  const key = species.trim().toLowerCase();
  if (CURATED[key]) return CURATED[key];
  return PALETTE[hashString(key) % PALETTE.length];
}
