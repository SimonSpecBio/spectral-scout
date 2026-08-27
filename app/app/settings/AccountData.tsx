"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

// CCPA/CPRA right to know + right to delete (and the GDPR equivalent) --
// see app/api/account/export and app/api/account's own comments for the
// compliance reasoning. Deletion needs a typed "DELETE" confirmation rather
// than a plain browser confirm() -- unlike removing a single teammate, this
// can take an entire multi-person organization's data with it, and a
// reflexively-clicked confirm() dialog is too easy to blow through for
// something this hard to reverse.
export default function AccountData({ isOwner, blockedAsOnlyOwner }: { isOwner: boolean; blockedAsOnlyOwner: boolean }) {
  const router = useRouter();
  const [exporting, setExporting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function exportData() {
    setExporting(true);
    try {
      const res = await fetch("/api/account/export");
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `spectral-scout-export-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setError("Couldn't export your data. Check your connection and try again.");
    }
    setExporting(false);
  }

  async function deleteAccount() {
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch("/api/account", { method: "DELETE" });
      if (res.ok) {
        router.push("/");
        router.refresh();
      } else {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "Couldn't delete your account. Check your connection and try again.");
        setDeleting(false);
      }
    } catch {
      setError("Couldn't delete your account. Check your connection and try again.");
      setDeleting(false);
    }
  }

  return (
    <div className="card flex flex-col gap-4 p-4">
      <div>
        <div className="text-sm font-medium">Your data</div>
        <p className="mt-1 text-xs text-[var(--text-dim)]">Download a copy of everything in your account, or permanently delete it.</p>
      </div>

      <button
        onClick={exportData}
        disabled={exporting}
        className="self-start rounded-md border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--text-dim)] disabled:opacity-50"
      >
        {exporting ? "Preparing…" : "Export my data"}
      </button>

      <div className="flex flex-col gap-2 border-t border-[var(--border)] pt-4">
        <div className="text-sm font-medium" style={{ color: "var(--danger)" }}>
          Delete account
        </div>
        {blockedAsOnlyOwner ? (
          <p className="text-xs text-[var(--text-dim)]">
            You&rsquo;re the only owner and other teammates still have access. Promote another owner or remove the rest of the team in{" "}
            <a href="/app/team" className="underline">
              Team
            </a>{" "}
            before deleting your account.
          </p>
        ) : (
          <p className="text-xs text-[var(--text-dim)]">
            {isOwner
              ? "This permanently deletes your account and your entire organization -- every facility, event, treatment, and photo. This can't be undone."
              : "This permanently deletes your account. Your organization and teammates keep their data -- only your own login and membership are removed."}
          </p>
        )}

        {!blockedAsOnlyOwner && !showDeleteConfirm && (
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="self-start rounded-md border px-3 py-1.5 text-sm"
            style={{ borderColor: "var(--danger)", color: "var(--danger)" }}
          >
            Delete my account
          </button>
        )}

        {showDeleteConfirm && (
          <div className="flex flex-col gap-2">
            <label className="label-mono">
              Type DELETE to confirm{isOwner ? " -- this takes your whole organization with it" : ""}
            </label>
            <input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              className="rounded-md border border-[var(--border)] bg-transparent px-3 py-2 text-sm"
              placeholder="DELETE"
            />
            <div className="flex gap-2">
              <button
                onClick={deleteAccount}
                disabled={confirmText !== "DELETE" || deleting}
                className="rounded-md border px-3 py-1.5 text-sm disabled:opacity-50"
                style={{ borderColor: "var(--danger)", color: "var(--danger)" }}
              >
                {deleting ? "Deleting…" : "Permanently delete"}
              </button>
              <button
                onClick={() => {
                  setShowDeleteConfirm(false);
                  setConfirmText("");
                }}
                className="rounded-md border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--text-dim)]"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="flex items-center justify-between gap-3 rounded-md p-3.5 text-sm" style={{ background: "var(--danger-bg)", color: "var(--danger)" }}>
          {error}
          <button type="button" onClick={() => setError(null)} className="shrink-0 text-[var(--text-dim)]">
            Dismiss
          </button>
        </div>
      )}
    </div>
  );
}
