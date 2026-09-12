import { and, eq, gte, sql } from "drizzle-orm";
import { db } from "@/db";
import { establishmentChecks, inventoryItems, tasks, treatments } from "@/db/schema";
import { claimIdempotencyKey, completeIdempotencyKey } from "@/lib/idempotency";

export function secondPulseFieldsFrom(body: { secondPulseOffsetMinutes?: unknown; secondPulseDurationMinutes?: unknown }) {
  const secondPulseOffsetMinutes = typeof body.secondPulseOffsetMinutes === "number" ? body.secondPulseOffsetMinutes : null;
  const secondPulseDurationMinutes = typeof body.secondPulseDurationMinutes === "number" ? body.secondPulseDurationMinutes : null;
  const hasSecondPulse = secondPulseOffsetMinutes != null && secondPulseDurationMinutes != null;
  return {
    secondPulseOffsetMinutes: hasSecondPulse ? secondPulseOffsetMinutes : null,
    secondPulseDurationMinutes: hasSecondPulse ? secondPulseDurationMinutes : null,
    pulseCount: hasSecondPulse ? 2 : 1,
  };
}

const DAY_MS = 86_400_000;
const ESTABLISHMENT_CHECK_DAYS = 7;
const TREATMENT_OPERATION = "treatment.create";

export async function insertTreatmentAndDecrementStock(organizationId: string, values: typeof treatments.$inferInsert) {
  let inventoryItemId = values.inventoryItemId ?? null;
  if (inventoryItemId) {
    const [item] = await db.select().from(inventoryItems).where(eq(inventoryItems.id, inventoryItemId));
    if (!item || item.organizationId !== organizationId) inventoryItemId = null;
  }

  const { row, stockWentNegative } = await db.transaction(async (tx) => {
    const clientRequestId = values.clientRequestId ?? null;
    const semanticValues = { ...values, inventoryItemId, clientRequestId: undefined };

    if (clientRequestId) {
      const claim = await claimIdempotencyKey(tx, {
        organizationId,
        operation: TREATMENT_OPERATION,
        clientRequestId,
        payload: semanticValues,
      });
      if (claim.replay) {
        if (!claim.resourceId) throw new Error("Completed treatment replay is missing its resource id");
        const [existing] = await tx
          .select()
          .from(treatments)
          .where(and(eq(treatments.id, claim.resourceId), eq(treatments.facilityId, values.facilityId)));
        if (!existing) throw new Error("Idempotency receipt references an unavailable treatment");
        return { row: existing, stockWentNegative: existing.stockWentNegative };
      }
    }

    const [inserted] = await tx.insert(treatments).values({ ...values, inventoryItemId }).returning();

    let stockWentNegative = false;
    if (inventoryItemId && values.quantityUsed) {
      const [updated] = await tx
        .update(inventoryItems)
        .set({ quantity: sql`${inventoryItems.quantity} - ${values.quantityUsed}` })
        .where(and(eq(inventoryItems.id, inventoryItemId), gte(inventoryItems.quantity, values.quantityUsed)))
        .returning();

      if (!updated) {
        await tx.update(inventoryItems).set({ quantity: 0 }).where(eq(inventoryItems.id, inventoryItemId));
        stockWentNegative = true;
        await tx.update(treatments).set({ stockWentNegative: true }).where(eq(treatments.id, inserted.id));
      }
    }

    if (inserted.type === "biological" && inserted.product) {
      const [task] = await tx
        .insert(tasks)
        .values({
          organizationId,
          title: `Check ${inserted.product} establishment`,
          type: "establishment_check",
          facilityId: inserted.facilityId,
          pestEventId: inserted.pestEventId,
          x: inserted.x,
          y: inserted.y,
          dueAt: new Date(inserted.appliedAt.getTime() + ESTABLISHMENT_CHECK_DAYS * DAY_MS),
        })
        .returning();
      await tx.insert(establishmentChecks).values({
        organizationId,
        taskId: task.id,
        treatmentId: inserted.id,
        agentName: inserted.product,
      });
    }

    if (clientRequestId) {
      await completeIdempotencyKey(tx, {
        organizationId,
        operation: TREATMENT_OPERATION,
        clientRequestId,
        resourceId: inserted.id,
      });
    }

    return { row: inserted, stockWentNegative };
  });

  return { ...row, stockWentNegative };
}
