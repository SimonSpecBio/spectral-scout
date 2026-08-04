import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as appSchema from "./schema";
import * as authSchema from "./auth-schema";
import * as pilotsMirror from "./pilots-mirror";

// pilots-mirror is included in the runtime query client (so app code can
// query it normally) but NOT in drizzle.config.ts's `schema` array (so
// db:generate/db:migrate never try to manage it -- see that file's header
// comment).
const schema = { ...appSchema, ...authSchema, ...pilotsMirror };

// pg.Pool doesn't open a real connection at construction time -- only on
// first query -- so this is safe to create eagerly even during `next
// build`'s page-data-collection pass, before DATABASE_URL is necessarily
// set. It has to be a real (not lazily-proxied) instance because
// @auth/drizzle-adapter's DrizzleAdapter() inspects `db`'s actual shape at
// import time to detect the SQL dialect; a Proxy that only forwards `get`
// doesn't survive that kind of structural check.
//
// Cached on `global` so dev-mode HMR/Turbopack module re-evaluation don't
// open a new pool on every reload.
declare global {
  var __scoutPool: Pool | undefined;
  var __scoutDb: NodePgDatabase<typeof schema> | undefined;
}

const pool = (global.__scoutPool ??= new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes("localhost") ? false : { rejectUnauthorized: false },
}));

export const db: NodePgDatabase<typeof schema> = (global.__scoutDb ??= drizzle(pool, { schema }));
