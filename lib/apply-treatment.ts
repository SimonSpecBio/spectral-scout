import { and, eq, gte, sql } from "drizzle-orm";
import { db } from "@/db";
import { establishmentChecks, inventoryItems, tasks, treatments } from "@/db/schema";

// Shared by both treatment POST routes -- a request body's secondPulse*
// fields (from the "Multiple nightly treatments?" toggle, Airtable ticket
// C3) only mean anything together: an offset with no duration (or vice
// versa) isn't a real second pulse, so pulseCount is DERIVED from both
// being present rather than trusted as a client-sent number.
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
// A week is the common IPM middle-ground for a first establishment read --
// long enough for a released predator/parasitoid to start visibly working
// (or not), short enough that a real failure is still catchable before the
// pest rebounds hard. Not sourced to one specific citation; a reasonable
// default rather than a fabricated precise number.
const ESTABLISHMENT_CHECK_DAYS = 7;

// Shared by both treatment-creation routes (event-scoped and standalone
// "Application log") so the inventory-decrement side effect only lives in
// one place. Per ARCHITECTURE.md's trigger rules: "Treatment logged ->
// decrement InventoryItem." Low-stock notification is handled by whatever
// screen reads inventoryItems.quantity vs reorderLevel at render time (the
// Inventory screen's LOW STOCK badge) rather than a separate event here --
// there's no notification feed to push into yet.
//
// organizationId is required (not inferred from the row) specifically so
// values.inventoryItemId -- client-supplied, only type-checked by the
// caller -- gets verified to actually belong to that org before it's
// trusted for anything. Without this, a crafted inventoryItemId from a
// different org would let one organization silently decrement another's
// stock. An unowned id has its link dropped rather than failing the whole
// request -- treated as "not from inventory" instead of punishing a
// legitimate submission for what's only ever a malicious/buggy client id.
export async function insertTreatmentAndDecrementStock(organizationId: string, values: typeof treatments.$inferInsert) {
  let inventoryItemId = values.inventoryItemId ?? null;
  if (inventoryItemId) {
    const [item] = await db.select().from(inventoryItems).where(eq(inventoryItems.id, inventoryItemId));
    if (!item || item.organizationId !== organizationId) inventoryItemId = null;
  }

  // Treatment insert + inventory decrement now run in one transaction
  // (product brief, 5 Sep 2026, Task 1.5) -- previously two separate
  // statements, so a crash between them could leave a treatment logged
  // with no matching stock decrement, or vice versa.
  const { row, stockWentNegative } = await db.transaction(async (tx) => {
    // A retry replaying the same clientRequestId (ticket recRdeguTZUTY5A7B --
    // a request that timed out client-side after actually committing
    // server-side, or two tabs/devices flushing the same queued item at
    // once) must not decrement stock a second time. onConflictDoNothing
    // detects it via the column's unique constraint; the plain insert path
    // (no clientRequestId at all -- a caller not going through the offline
    // queue) is unaffected.
    const insertQuery = tx.insert(treatments).values({ ...values, inventoryItemId });
    const [inserted] = values.clientRequestId
      ? await insertQuery.onConflictDoNothing({ target: treatments.clientRequestId }).returning()
      : await insertQuery.returning();

    if (!inserted) {
      const [existing] = await tx.select().from(treatments).where(eq(treatments.clientRequestId, values.clientRequestId!));
      return { row: existing, stockWentNegative: false };
    }

    let stockWentNegative = false;
    if (inventoryItemId && values.quantityUsed) {
      // Atomic, race-safe decrement computed in SQL against the row's live
      // value under Postgres's own row lock, not a JS number read moments
      // earlier -- two concurrent applies against the same item can no
      // longer both read the same starting quantity and silently lose one
      // decrement (product brief's "two concurrent applies -> stock
      // correct" test). The WHERE guard means this only succeeds when
      // there's enough recorded stock to cover it.
      const [updated] = await tx
        .update(inventoryItems)
        .set({ quantity: sql`${inventoryItems.quantity} - ${values.quantityUsed}` })
        .where(and(eq(inventoryItems.id, inventoryItemId), gte(inventoryItems.quantity, values.quantityUsed)))
        .returning();

      if (!updated) {
        // Not enough recorded stock to fully cover this. Floored at 0
        // rather than rejecting the treatment outright: a treatment
        // genuinely applied in the field has to be recordable regardless
        // of whether the inventory bookkeeping is behind -- REI/PHI
        // restrictions depend on this row existing, which is a safety
        // concern a hard reject would make worse, not better. This second
        // update has its own narrow race window (two simultaneous
        // over-limit applies could each floor to 0 instead of compounding
        // correctly) -- accepted since it only triggers in the already-
        // abnormal "recorded stock ran out" case, not the common path the
        // atomic update above already covers.
        await tx.update(inventoryItems).set({ quantity: 0 }).where(eq(inventoryItems.id, inventoryItemId));
        stockWentNegative = true;
        // Carry the flag onto the row itself -- previously only returned
        // in the API response, so it was lost as soon as that response was
        // rendered. Phase 1.5's dose/outcome export needs it to persist.
        await tx.update(treatments).set({ stockWentNegative: true }).where(eq(treatments.id, inserted.id));
      }
    }

    // Silent release failure is a real, common way growers lose money
    // without realizing it -- prompt a check-in instead of only ever
    // tracking pest counts (FUTURE_FEATURES_THEORIZING.md #4). Every
    // biological treatment gets one, whether logged via the recommendation
    // engine's Apply button or a manual Application log entry, since both
    // funnel through here.
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

    return { row: inserted, stockWentNegative };
  });

  // Surfaced rather than hidden (the brief's actual complaint about the old
  // clamp-to-zero behavior: it wasn't wrong to floor at 0, it was wrong to
  // do it silently) -- callers can show a "logged, but you used more than
  // you had recorded in stock" warning without it blocking the log itself.
  return { ...row, stockWentNegative };
}
