import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as appSchema from "@/db/schema";
import * as authSchema from "@/db/auth-schema";

// db/pilots-mirror.ts is deliberately excluded: it is an external mirror the
// app only reads, never created by this project's migrations (see
// drizzle.config.ts), so it has no table in ./drizzle to build here and no
// invariant in this suite touches it.
const schema = { ...appSchema, ...authSchema };

export type TestDb = PgliteDatabase<typeof schema>;

let cached: Promise<TestDb> | undefined;

// One in-memory Postgres per test worker. pglite is real Postgres compiled
// to WASM, so transactions, unique constraints, enums and gen_random_uuid()
// behave exactly as they do against the production Supabase instance -- the
// whole point of these invariants is that they depend on those DB
// guarantees, not on anything a mock could fake.
//
// It exists only in this process's memory: there is no connection string, so
// it CANNOT be pointed at production or the shared Supabase database, and it
// needs no running Postgres server, which is what makes the suite
// reproducible in CI with nothing but `npm ci && npm test`.
export function getTestDb(): Promise<TestDb> {
  if (!cached) {
    cached = (async () => {
      const client = new PGlite();
      const db = drizzle(client, { schema }) as unknown as TestDb;
      // Apply the real migration history from ./drizzle so the schema under
      // test is exactly what `npm run db:migrate` produces everywhere else,
      // rather than a hand-maintained second definition that could drift.
      await migrate(db, { migrationsFolder: "drizzle" });
      return db;
    })();
  }
  return cached;
}

// --- Seed helpers ----------------------------------------------------------
// Small, explicit builders for the notNull columns each invariant needs.
// Every seeded org/facility/area gets a random name so tests that share the
// per-worker database never collide by accident.

export async function seedOrg(db: TestDb, name = `Org ${randomUUID().slice(0, 8)}`) {
  const [org] = await db.insert(appSchema.organizations).values({ name }).returning();
  return org;
}

export async function seedFacility(db: TestDb, organizationId: string, name = `Facility ${randomUUID().slice(0, 8)}`) {
  const [facility] = await db.insert(appSchema.facilities).values({ organizationId, name }).returning();
  return facility;
}

export async function seedArea(db: TestDb, facilityId: string, name = `Area ${randomUUID().slice(0, 8)}`) {
  const [area] = await db.insert(appSchema.facilityAreas).values({ facilityId, name }).returning();
  return area;
}

// The full org -> facility -> area scaffold most invariants start from.
export async function seedOrgScaffold(db: TestDb) {
  const org = await seedOrg(db);
  const facility = await seedFacility(db, org.id);
  const area = await seedArea(db, facility.id);
  return { org, facility, area };
}

export async function seedInventoryItem(
  db: TestDb,
  organizationId: string,
  values: Partial<typeof appSchema.inventoryItems.$inferInsert> = {}
) {
  const [item] = await db
    .insert(appSchema.inventoryItems)
    .values({
      organizationId,
      category: "beneficial",
      name: `Item ${randomUUID().slice(0, 8)}`,
      unit: "units",
      quantity: 100,
      ...values,
    })
    .returning();
  return item;
}
