import { and, eq, gte, inArray } from "drizzle-orm";
import { db } from "@/db";
import { users as authUsers } from "@/db/auth-schema";
import { facilities, inventoryItems, inventoryOrders, pestEvents, shareNotifications, tasks, treatments } from "@/db/schema";
import { bayLabel, nearestBay } from "@/lib/floorplan-bays";
import { computeScoutingAlerts, scoutingAlertConfirmHref } from "@/lib/scouting-alerts";
import { computeEscalationAlerts, computeMonitoringAlerts, metricLabel } from "@/lib/threshold-engine";
import { computeTrapAlerts } from "@/lib/trap-alerts";
import { taskActionHref, taskUrgency } from "@/lib/tasks";
import { displayNameForPestSpecies } from "@/lib/treatments-catalog";

export type NotificationKind =
  | "threshold"
  | "trap"
  | "scouting"
  | "lowstock"
  | "task_assigned"
  | "task_overdue"
  | "rei_cleared"
  | "order_placed"
  | "event_auto_resolved"
  | "escalation"
  | "shared_event";

export interface Notification {
  id: string; // stable across renders -- localStorage read-state keys off this, not array index
  kind: NotificationKind;
  title: string;
  sub: string;
  at: Date;
  href: string;
}

const DAY_MS = 86_400_000;

// A computed feed, not a stored table -- every underlying signal here
// (threshold/trap/low-stock/REI/tasks) is already derived live elsewhere
// in the app (dashboard Attention Required, Traps, Inventory, REI/PHI,
// Schedule); this just re-surfaces the same real data as a
// notifications-shaped list (12_notifications.svg) instead of duplicating
// it into a separate table that could drift out of sync. Read/unread state
// lives client-side (NotificationsClient.tsx, localStorage) since there's
// no server-side "when did this alert first become true" timestamp to
// anchor a real unread flag to.
export async function computeNotifications(organizationId: string, userId: string): Promise<Notification[]> {
  const notifications: Notification[] = [];

  const monitoringAlerts = await computeMonitoringAlerts(organizationId);
  for (const a of monitoringAlerts) {
    notifications.push({
      id: `threshold-${a.eventId}`,
      kind: "threshold",
      title: `${displayNameForPestSpecies(a.pestSpecies)} over threshold`,
      sub: metricLabel({ kind: a.metricKind, value: a.value }),
      at: a.at,
      href: `/app/facilities/${a.facilityId}/pest-events/${a.eventId}`,
    });
  }

  const trapAlerts = (await computeTrapAlerts(organizationId)).filter((a) => !a.dedupedIntoEventId);
  for (const a of trapAlerts) {
    notifications.push({
      id: `trap-${a.trapId}`,
      kind: "trap",
      title: `${a.trapLabel} spike. Confirm?`,
      sub: `${a.catchPerDay.toFixed(1)}/day ${displayNameForPestSpecies(a.pestSpecies)}`,
      at: a.readingAt,
      href: `/app/traps?facility=${a.facilityId}`,
    });
  }

  const scoutingAlerts = await computeScoutingAlerts(organizationId);
  for (const a of scoutingAlerts) {
    notifications.push({
      id: `scouting-${a.observationId}`,
      kind: "scouting",
      title: `Scouting log over threshold. Confirm?`,
      sub: metricLabel({ kind: a.metricKind, value: a.value }),
      at: a.at,
      href: scoutingAlertConfirmHref(a),
    });
  }

  const escalationAlerts = await computeEscalationAlerts(organizationId);
  for (const a of escalationAlerts) {
    notifications.push({
      id: `escalation-${a.eventId}`,
      kind: "escalation",
      title: `${displayNameForPestSpecies(a.pestSpecies)} not improving. Try a different tier?`,
      sub: `${metricLabel({ kind: a.metricKind, value: a.baselineValue })} → ${metricLabel({ kind: a.metricKind, value: a.latestValue })} after ${a.daysSinceTreatment}d`,
      at: a.at,
      href: `/app/facilities/${a.facilityId}/pest-events/${a.eventId}?tab=recommended`,
    });
  }

  const lowStock = await db.select().from(inventoryItems).where(eq(inventoryItems.organizationId, organizationId));
  for (const i of lowStock) {
    if (i.reorderLevel == null || Number(i.quantity) > Number(i.reorderLevel)) continue;
    notifications.push({
      id: `lowstock-${i.id}`,
      kind: "lowstock",
      title: `${i.name} low stock`,
      sub: `${Number(i.quantity)} ${i.unit === "units" ? "" : i.unit} left, reorder`,
      at: i.createdAt,
      href: "/app/inventory",
    });
  }

  const orgFacilities = await db.select().from(facilities).where(eq(facilities.organizationId, organizationId));
  const facilityIds = orgFacilities.map((f) => f.id);

  // "Notify the grower with a confirmation" when maybeAutoResolve
  // (lib/threshold-engine.ts) closes an event on its own -- a grower who
  // manually resolves an event already knows, so this is scoped to
  // autoResolved=true specifically. 3-day window, same spirit as
  // rei_cleared's `since` below: recent enough to matter, not a
  // forever-lingering notification for something long since handled.
  if (facilityIds.length > 0) {
    const recentAutoResolved = await db
      .select()
      .from(pestEvents)
      .where(
        and(
          inArray(pestEvents.facilityId, facilityIds),
          eq(pestEvents.status, "resolved"),
          eq(pestEvents.autoResolved, true),
          gte(pestEvents.resolvedAt, new Date(Date.now() - 3 * DAY_MS))
        )
      );
    for (const e of recentAutoResolved) {
      notifications.push({
        id: `auto-resolved-${e.id}`,
        kind: "event_auto_resolved",
        title: `${displayNameForPestSpecies(e.pestSpecies)} auto-resolved`,
        sub: "Under threshold for 2 consecutive sessions",
        at: e.resolvedAt!,
        href: `/app/facilities/${e.facilityId}/pest-events/${e.id}`,
      });
    }
  }

  if (facilityIds.length > 0) {
    const since = new Date(Date.now() - DAY_MS);
    const recentTreatments = await db
      .select({ treatment: treatments, item: inventoryItems })
      .from(treatments)
      .innerJoin(inventoryItems, eq(treatments.inventoryItemId, inventoryItems.id))
      .where(and(inArray(treatments.facilityId, facilityIds), gte(treatments.appliedAt, new Date(Date.now() - 30 * DAY_MS))));
    for (const { treatment: t, item } of recentTreatments) {
      if (t.x == null || t.y == null || item.reiHours == null) continue;
      const reiEndsAt = new Date(t.appliedAt.getTime() + item.reiHours * 3_600_000);
      if (reiEndsAt.getTime() <= Date.now() && reiEndsAt.getTime() > since.getTime()) {
        notifications.push({
          id: `rei-cleared-${t.id}`,
          kind: "rei_cleared",
          title: `${bayLabel(nearestBay(t.x, t.y))} re-entry cleared`,
          sub: `${item.name} REI ended`,
          at: reiEndsAt,
          href: "/app/rei-phi",
        });
      }
    }

    const itemIds = lowStock.map((i) => i.id);
    const orders = itemIds.length ? await db.select().from(inventoryOrders).where(inArray(inventoryOrders.itemId, itemIds)) : [];
    const itemById = new Map(lowStock.map((i) => [i.id, i]));
    for (const o of orders) {
      const item = itemById.get(o.itemId);
      if (!item) continue;
      notifications.push({
        id: `order-${o.id}`,
        kind: "order_placed",
        title: `${item.name} on order`,
        sub: [`${o.quantity} ${item.unit}`, o.supplier, o.expectedAt ? `ETA ${o.expectedAt}` : null].filter(Boolean).join(" · "),
        at: o.createdAt,
        href: "/app/inventory",
      });
    }
  }

  // Team-member sharing (ticket B5) -- unlike every other notification in
  // this feed, this one is genuinely toUserId-scoped, not org-wide: only
  // the person a teammate shared WITH should see it, same as myTasks below.
  const sharedWithMe = await db
    .select({
      id: shareNotifications.id,
      pestEventId: shareNotifications.pestEventId,
      createdAt: shareNotifications.createdAt,
      facilityId: pestEvents.facilityId,
      pestSpecies: pestEvents.pestSpecies,
      fromName: authUsers.name,
      fromEmail: authUsers.email,
    })
    .from(shareNotifications)
    .innerJoin(pestEvents, eq(shareNotifications.pestEventId, pestEvents.id))
    .leftJoin(authUsers, eq(shareNotifications.fromUserId, authUsers.id))
    .where(and(eq(shareNotifications.organizationId, organizationId), eq(shareNotifications.toUserId, userId)));
  for (const s of sharedWithMe) {
    notifications.push({
      id: `shared-${s.id}`,
      kind: "shared_event",
      title: `${displayNameForPestSpecies(s.pestSpecies)} shared with you`,
      sub: `by ${s.fromName ?? s.fromEmail ?? "a teammate"}`,
      at: s.createdAt,
      href: `/app/facilities/${s.facilityId}/pest-events/${s.pestEventId}`,
    });
  }

  const myTasks = await db.select().from(tasks).where(and(eq(tasks.organizationId, organizationId), eq(tasks.assigneeUserId, userId)));
  for (const t of myTasks) {
    if (t.status !== "open") continue;
    const urgency = taskUrgency(t);
    if (urgency === "overdue") {
      notifications.push({
        id: `task-overdue-${t.id}`,
        kind: "task_overdue",
        title: `${t.title} overdue`,
        sub: "Assigned to you",
        at: t.dueAt,
        href: taskActionHref(t),
      });
    } else {
      notifications.push({
        id: `task-assigned-${t.id}`,
        kind: "task_assigned",
        title: t.title,
        sub: "Assigned to you",
        at: t.createdAt,
        href: taskActionHref(t),
      });
    }
  }

  return notifications.sort((a, b) => b.at.getTime() - a.at.getTime());
}
