"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { initialsFor } from "@/lib/avatar";

interface Member {
  membershipId: string;
  userId: string;
  name: string | null;
  email: string;
  role: "owner" | "member";
  createdAt: string;
}
interface Invite {
  id: string;
  email: string;
  role: "owner" | "member";
  createdAt: string;
}

function Avatar({ name, email }: { name: string | null; email: string }) {
  return (
    <span
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs"
      style={{ background: "var(--chip-bg)", color: "var(--text-dim)" }}
    >
      {initialsFor(name, email)}
    </span>
  );
}

export default function TeamClient({
  currentUserId,
  isOwner,
  initialMembers,
  initialInvites,
}: {
  currentUserId: string;
  isOwner: boolean;
  initialMembers: Member[];
  initialInvites: Invite[];
}) {
  const router = useRouter();
  const [members, setMembers] = useState(initialMembers);
  const [pendingInvites, setPendingInvites] = useState(initialInvites);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"owner" | "member">("member");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function sendInvite(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const res = await fetch("/api/team", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, role }),
    });
    if (res.ok) {
      const row = await res.json();
      setPendingInvites((prev) => [...prev, row]);
      setEmail("");
    } else {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Couldn't send invite.");
    }
    setSubmitting(false);
  }

  async function removeMember(member: Member) {
    if (!confirm(`Remove ${member.name ?? member.email} from the team?`)) return;
    const res = await fetch(`/api/team/members/${member.membershipId}`, { method: "DELETE" });
    if (res.ok) {
      setMembers((prev) => prev.filter((m) => m.membershipId !== member.membershipId));
      router.refresh();
    } else {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Couldn't remove member.");
    }
  }

  async function cancelInvite(invite: Invite) {
    if (!confirm(`Cancel the invite to ${invite.email}?`)) return;
    const res = await fetch(`/api/team/invites/${invite.id}`, { method: "DELETE" });
    if (res.ok) setPendingInvites((prev) => prev.filter((i) => i.id !== invite.id));
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="card flex flex-col divide-y divide-[var(--border)]">
        {members.map((m) => (
          <div key={m.membershipId} className="flex items-center gap-3 p-3.5">
            <Avatar name={m.name} email={m.email} />
            <div className="flex-1">
              <div className="text-sm">{m.name ?? m.email}</div>
              <div className="label-mono">{m.role.toUpperCase()}</div>
            </div>
            {isOwner && m.userId !== currentUserId && (
              <button onClick={() => removeMember(m)} className="text-xs text-[var(--danger)]">
                Remove
              </button>
            )}
          </div>
        ))}
      </div>

      {pendingInvites.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="label-mono">Pending invites</div>
          <div className="card flex flex-col divide-y divide-[var(--border)]">
            {pendingInvites.map((i) => (
              <div key={i.id} className="flex items-center justify-between p-3.5 text-sm">
                <div>
                  <div>{i.email}</div>
                  <div className="label-mono">{i.role.toUpperCase()}</div>
                </div>
                {isOwner && (
                  <button onClick={() => cancelInvite(i)} className="text-xs text-[var(--text-dim)]">
                    Cancel
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {isOwner && (
        <form onSubmit={sendInvite} className="card flex flex-col gap-2 p-4">
          <div className="text-sm font-medium">Invite a team member</div>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="email@example.com"
            required
            className="rounded-md border border-[var(--border)] bg-transparent px-3 py-2 text-sm"
          />
          <div className="flex gap-2">
            {(["member", "owner"] as const).map((r) => (
              <button
                type="button"
                key={r}
                onClick={() => setRole(r)}
                className={`flex-1 rounded-md border px-3 py-1.5 text-sm capitalize ${
                  role === r ? "border-[var(--accent)] text-[var(--accent)]" : "border-[var(--border)] text-[var(--text-dim)]"
                }`}
              >
                {r === "owner" ? "Manager" : "Scout"}
              </button>
            ))}
          </div>
          {error && <div className="text-sm text-[var(--danger)]">{error}</div>}
          <button
            type="submit"
            disabled={submitting || !email.trim()}
            className="self-start rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-[var(--on-accent)] disabled:opacity-50"
          >
            {submitting ? "Sending…" : "Send invite"}
          </button>
        </form>
      )}
    </div>
  );
}
