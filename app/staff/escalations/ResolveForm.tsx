"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function ResolveForm({ escalationId }: { escalationId: string }) {
  const router = useRouter();
  const [staffResponse, setStaffResponse] = useState("");
  const [saving, setSaving] = useState(false);

  async function resolve() {
    setSaving(true);
    await fetch(`/api/staff/escalations/${escalationId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ staffResponse: staffResponse.trim() || null }),
    });
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-2 border-t border-[var(--border)] pt-3">
      <textarea
        value={staffResponse}
        onChange={(e) => setStaffResponse(e.target.value)}
        placeholder="Response to share with the grower (optional)"
        rows={2}
        className="rounded-md border border-[var(--border)] bg-transparent px-3 py-2 text-sm"
      />
      <button
        onClick={resolve}
        disabled={saving}
        className="self-start rounded-md border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--text-dim)] disabled:opacity-50"
      >
        {saving ? "Saving…" : "Mark resolved"}
      </button>
    </div>
  );
}
