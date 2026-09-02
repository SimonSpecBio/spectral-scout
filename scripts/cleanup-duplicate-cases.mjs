// One-off (but safe to re-run) cleanup for pest events that were opened as
// duplicates of an already-active case in the same area before two fixes
// landed: canonical pest ids (freeform species text like "spider mites"
// used to be a different string than "pest_tssm") and the one-open-case-
// per-area dedup check itself. Needed before the DB-level partial unique
// index (db/schema.ts's scout_pest_event_open_case_idx) can be applied --
// that migration fails outright if any duplicate active rows still exist.
//
// Never deletes scout/treatment/comment/photo/escalation/share-link
// history -- every record that pointed at a duplicate "extra" event gets
// RE-POINTED to the surviving (newest) event instead, then the extra event
// itself is marked resolved (never deleted, since deleting it would drop
// its own createdAt/severity/timeline value). Duplicate OPEN auto-created
// tasks that now point at the same survivor are snoozed down to one.
//
// Usage:
//   npx tsx scripts/cleanup-duplicate-cases.mjs           (dry run, default)
//   npx tsx scripts/cleanup-duplicate-cases.mjs --apply   (actually writes)
import fs from "fs";

const envPath = fs.existsSync(".env.local") ? ".env.local" : null;
if (envPath) {
  const envText = fs.readFileSync(envPath, "utf8");
  for (const line of envText.split("\n")) {
    const m = line.match(/^([A-Z_0-9]+)=(.*)$/);
    if (m) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
  }
}

const APPLY = process.argv.includes("--apply");

const { db } = await import("../db/index.ts");
const {
  pestEvents,
  scoutingObservations,
  treatments,
  tasks,
  observationPhotos,
  pestEventComments,
  escalations,
  shareLinks,
  shareNotifications,
} = await import("../db/schema.ts");
const { resolveCanonicalPestId } = await import("../lib/treatments-catalog.ts");
const { eq, and } = await import("drizzle-orm");

const active = await db.select().from(pestEvents).where(eq(pestEvents.status, "active"));

const groups = new Map();
for (const e of active) {
  if (!e.facilityAreaId) continue;
  const canonical = resolveCanonicalPestId(e.pestSpecies);
  const key = `${e.facilityAreaId}::${canonical}`;
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push({ ...e, canonical });
}

const dupeGroups = [...groups.entries()].filter(([, rows]) => rows.length > 1);
console.log(`${APPLY ? "APPLYING" : "DRY RUN"} -- ${dupeGroups.length} duplicate (area, canonical pest) group(s) found`);

let eventsResolved = 0;
let tasksSnoozed = 0;
let recordsRepointed = 0;

for (const [key, rows] of dupeGroups) {
  rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  const [survivor, ...extras] = rows;
  console.log(`\n${key}`);
  console.log(`  keep:    ${survivor.id} (pestSpecies="${survivor.pestSpecies}", created ${survivor.createdAt.toISOString()})`);
  for (const extra of extras) {
    console.log(`  resolve: ${extra.id} (pestSpecies="${extra.pestSpecies}", created ${extra.createdAt.toISOString()})`);
  }

  if (!APPLY) continue;

  await db.transaction(async (tx) => {
    // Canonicalize the survivor's own species string too, if it wasn't
    // already (e.g. survivor was the "spider mites" row, not the
    // "pest_tssm" one).
    if (survivor.pestSpecies !== survivor.canonical) {
      await tx.update(pestEvents).set({ pestSpecies: survivor.canonical }).where(eq(pestEvents.id, survivor.id));
    }

    for (const extra of extras) {
      const repoint = async (table, col) => {
        const res = await tx.update(table).set({ [col]: survivor.id }).where(eq(table[col], extra.id)).returning({ id: table.id });
        recordsRepointed += res.length;
      };
      await repoint(scoutingObservations, "promotedPestEventId");
      await repoint(treatments, "pestEventId");
      await repoint(observationPhotos, "pestEventId");
      await repoint(pestEventComments, "pestEventId");
      await repoint(escalations, "pestEventId");
      // shareLinks is unused going forward (Airtable ticket B5 replaced it
      // with shareNotifications) but not dropped -- its existing rows still
      // need repointing so an old link doesn't end up pointing at a
      // resolved/merged-away event.
      await repoint(shareLinks, "pestEventId");
      await repoint(shareNotifications, "pestEventId");
      // tasks handled separately below (needs dedup of its own, not a
      // plain repoint, since two extras' tasks can collide once both now
      // point at the same survivor).
      await tx.update(tasks).set({ pestEventId: survivor.id }).where(eq(tasks.pestEventId, extra.id));

      await tx
        .update(pestEvents)
        .set({ status: "resolved", resolvedAt: new Date(), notes: [extra.notes, `Merged into ${survivor.id} (duplicate case) by cleanup-duplicate-cases.mjs`].filter(Boolean).join(" -- ") })
        .where(eq(pestEvents.id, extra.id));
      eventsResolved++;
    }

    // Duplicate OPEN auto-created tasks that now all point at the same
    // survivor event -- keep the earliest-due one, snooze the rest so the
    // schedule doesn't show N copies of "Recheck X" for one real case.
    const survivorTasks = await tx
      .select()
      .from(tasks)
      .where(and(eq(tasks.pestEventId, survivor.id), eq(tasks.status, "open"), eq(tasks.source, "auto_trigger")));
    const byType = new Map();
    for (const t of survivorTasks) {
      if (!byType.has(t.type)) byType.set(t.type, []);
      byType.get(t.type).push(t);
    }
    for (const [, group] of byType) {
      if (group.length < 2) continue;
      group.sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime());
      const [, ...dupeTasks] = group;
      for (const t of dupeTasks) {
        await tx.update(tasks).set({ status: "snoozed" }).where(eq(tasks.id, t.id));
        tasksSnoozed++;
      }
    }
  });
}

console.log(`\n${APPLY ? "Applied" : "Would apply"}: ${eventsResolved} event(s) resolved, ${recordsRepointed} dependent record(s) re-pointed, ${tasksSnoozed} duplicate task(s) snoozed.`);
if (!APPLY) console.log("Re-run with --apply to actually write these changes.");
process.exit(0);
