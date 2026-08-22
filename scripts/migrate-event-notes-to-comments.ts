// One-time migration: preserve any pre-existing pestEvents.notes content as
// the first entry in the new scout_pest_event_comment thread, rather than
// silently dropping it now that the UI no longer reads/writes that field.
// authorUserId is left null -- there's no real author to attribute a
// freeform legacy note to. Safe to re-run: only touches events whose notes
// haven't already been migrated (checked by looking for an existing
// comment with the exact same body and a null author on that event).
import { readFileSync } from "node:fs";
import path from "node:path";

for (const line of readFileSync(path.join(__dirname, "..", ".env.local"), "utf8").split("\n")) {
  const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
}

async function main() {
  const { and, eq, isNull, ne, isNotNull } = await import("drizzle-orm");
  const { db } = await import("../db");
  const { pestEvents, pestEventComments } = await import("../db/schema");

  const rows = await db
    .select({ id: pestEvents.id, notes: pestEvents.notes })
    .from(pestEvents)
    .where(and(isNotNull(pestEvents.notes), ne(pestEvents.notes, "")));

  let migrated = 0;
  for (const row of rows) {
    const existing = await db
      .select({ id: pestEventComments.id })
      .from(pestEventComments)
      .where(and(eq(pestEventComments.pestEventId, row.id), isNull(pestEventComments.authorUserId), eq(pestEventComments.body, row.notes!)));
    if (existing.length > 0) continue;
    await db.insert(pestEventComments).values({ pestEventId: row.id, authorUserId: null, body: row.notes! });
    migrated++;
  }
  console.log(`Migrated ${migrated} of ${rows.length} pest event(s) with existing notes.`);
}

main().catch((e) => {
  console.error("FATAL", e);
  process.exit(1);
});
