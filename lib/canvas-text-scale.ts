// Mirrors globals.css's --text-3xs/2xs/xs scale, in raw px, for MapEditor's
// SVG text nodes -- a fixed numeric scale independent of the CSS variables
// themselves. Keep the two in sync by hand if either changes.
export const CANVAS_TEXT = {
  xs: 11,
  sm: 14,
  base: 16,
} as const;
