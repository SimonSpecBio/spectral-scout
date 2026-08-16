export type Theme = "light" | "dark";

export const THEME_COOKIE = "scout-theme";

export function parseTheme(value: string | undefined): Theme {
  return value === "dark" ? "dark" : "light";
}
