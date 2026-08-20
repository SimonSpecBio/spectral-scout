// Mirrors globals.css's --text-3xs/2xs/xs scale, in raw px, for Konva Text
// nodes -- canvas-rendered, so they can't consume CSS custom properties the
// way DOM/SVG text can. Keep the two in sync by hand if either changes.
export const CANVAS_TEXT = {
  xs: 11,
  sm: 14,
  base: 16,
} as const;
