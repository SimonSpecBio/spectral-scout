"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { queuedFetch } from "@/lib/offline-queue";

export default function NewFacilityForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const result = await queuedFetch("/api/facilities", { name }, "New site");
    if (result.ok) {
      setName("");
      router.refresh();
    } else {
      setError("Failed to create facility");
    }
    setSubmitting(false);
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-2">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Site name (e.g. West Campus)"
        required
        className="flex-1 rounded-md border border-[var(--border)] bg-transparent px-3 py-2 text-sm"
      />
      <button
        type="submit"
        disabled={submitting}
        className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-[var(--on-accent)] disabled:opacity-50"
      >
        {submitting ? "Adding…" : "Add facility"}
      </button>
      {error && <span className="self-center text-sm text-[var(--danger)]">{error}</span>}
    </form>
  );
}
