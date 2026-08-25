import { getTeam } from "@/lib/team";
import { requireGrowerSession } from "@/lib/session";
import TeamClient from "./TeamClient";

export const dynamic = "force-dynamic";

export default async function TeamPage() {
  const session = await requireGrowerSession();
  if (!session) return null;

  const { members, pendingInvites } = await getTeam(session.organizationId!);

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-6">
      <h1 className="text-2xl font-semibold">Team</h1>
      <TeamClient
        currentUserId={session.user!.id!}
        isOwner={session.membershipRole === "owner"}
        initialMembers={members.map((m) => ({ ...m, createdAt: m.createdAt.toISOString() }))}
        initialInvites={pendingInvites.map((i) => ({ ...i, createdAt: i.createdAt.toISOString() }))}
      />
    </div>
  );
}
