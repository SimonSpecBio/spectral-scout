"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function NewFacilityForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/facilities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Failed to create facility");
      setName("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-2">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Facility name (e.g. Main Site)"
        required
        className="flex-1 rounded-md border border-[var(--border)] bg-transparent px-3 py-2 text-sm"
      />
      <button
        type="submit"
        disabled={submitting}
        className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-[#0B1626] disabled:opacity-50"
      >
        {submitting ? "Adding…" : "Add facility"}
      </button>
      {error && <span className="self-center text-sm text-red-400">{error}</span>}
    </form>
  );
}
