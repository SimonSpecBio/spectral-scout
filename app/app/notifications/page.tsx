import { computeNotifications } from "@/lib/notifications";
import { requireGrowerSession } from "@/lib/session";
import NotificationsClient from "./NotificationsClient";

export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const session = await requireGrowerSession();
  if (!session) return null;

  const notifications = await computeNotifications(session.organizationId!, session.user!.id!);

  return (
    <div className="mx-auto flex max-w-md flex-col gap-6">
      <NotificationsClient notifications={notifications.map((n) => ({ ...n, at: n.at.toISOString() }))} />
    </div>
  );
}
