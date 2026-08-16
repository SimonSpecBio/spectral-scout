"use client";

import { createContext, useContext, useState } from "react";
import { THEME_COOKIE, type Theme } from "@/lib/theme";

const ThemeContext = createContext<{ theme: Theme; setTheme: (t: Theme) => void } | null>(null);

// Theme comes from the scout-theme cookie, read server-side (AppLayout,
// root layout.tsx) so the very first paint already has the right
// data-theme attribute on <html> -- no flash, no localStorage/blocking-
// script hack. This provider just mirrors that into React context so
// client components (the settings toggle, MapEditor's Konva canvas which
// can't read CSS custom properties) can read/change it without prop
// drilling, and keeps <html> + the cookie in sync when it changes.
export default function ThemeProvider({ initialTheme, children }: { initialTheme: Theme; children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(initialTheme);

  function setTheme(next: Theme) {
    setThemeState(next);
    document.documentElement.setAttribute("data-theme", next);
    document.cookie = `${THEME_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
  }

  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
