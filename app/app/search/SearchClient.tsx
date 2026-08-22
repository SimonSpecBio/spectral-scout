"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { SearchResult } from "@/app/api/search/route";

const TYPE_LABEL: Record<SearchResult["type"], string> = {
  event: "Events",
  treatment: "Treatments",
  site: "Sites",
  area: "Areas",
  comment: "Comments",
};
const TYPE_ORDER: SearchResult["type"][] = ["event", "treatment", "comment", "site", "area"];

export default function SearchClient() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [loading, setLoading] = useState(false);

  // Debounced -- one request per pause in typing, not one per keystroke.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults(null);
      return;
    }
    setLoading(true);
    const handle = setTimeout(async () => {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
      if (res.ok) setResults(await res.json());
      setLoading(false);
    }, 300);
    return () => clearTimeout(handle);
  }, [query]);

  const grouped = TYPE_ORDER.map((type) => ({ type, items: (results ?? []).filter((r) => r.type === type) })).filter(
    (g) => g.items.length > 0
  );

  return (
    <div className="flex flex-col gap-4">
      <input
        autoFocus
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search events, treatments, comments, sites…"
        className="rounded-md border border-[var(--border)] bg-transparent px-3 py-2.5 text-sm"
      />

      {query.trim().length >= 2 && !loading && results && results.length === 0 && (
        <div className="card p-4 text-sm text-[var(--text-dim)]">No results for &ldquo;{query}&rdquo;.</div>
      )}

      {grouped.map((g) => (
        <div key={g.type} className="flex flex-col gap-2">
          <div className="label-mono">{TYPE_LABEL[g.type]}</div>
          <div className="card flex flex-col divide-y divide-[var(--border)]">
            {g.items.map((r) => (
              <Link key={r.id} href={r.href} className="flex flex-col gap-0.5 p-3.5">
                <span className="text-sm">{r.label}</span>
                <span className="label-mono">{r.sub}</span>
              </Link>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
