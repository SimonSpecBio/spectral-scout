"use client";

import { useTheme } from "../ThemeProvider";

export default function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  return (
    <div className="card flex items-center justify-between p-4">
      <div>
        <div className="text-sm font-medium">Appearance</div>
        <div className="label-mono">{theme === "dark" ? "Dark" : "Light"} mode</div>
      </div>
      <div className="flex gap-2">
        {(["light", "dark"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTheme(t)}
            className={`rounded-md border px-3 py-1.5 text-sm capitalize ${
              theme === t ? "border-[var(--accent)] text-[var(--accent)]" : "border-[var(--border)] text-[var(--text-dim)]"
            }`}
          >
            {t}
          </button>
        ))}
      </div>
    </div>
  );
}
