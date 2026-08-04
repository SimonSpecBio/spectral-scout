import { integer, pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";

// Standard Auth.js Drizzle/Postgres schema. Table names prefixed scout_
// because this app shares its Postgres instance with spectral-ops
// ("user"/"account"/...), spectral-pilot ("pp_user"/...), and spectral-rnd
// ("rnd_user"/...) -- same per-app-prefix pattern used by all three.
export const users = pgTable("scout_user", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name"),
  email: text("email").notNull().unique(),
  emailVerified: timestamp("emailVerified", { mode: "date", withTimezone: true }),
  image: text("image"),
}).enableRLS();

export const accounts = pgTable(
  "scout_account",
  {
    userId: uuid("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("providerAccountId").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (account) => [primaryKey({ columns: [account.provider, account.providerAccountId] })]
).enableRLS();

export const sessions = pgTable("scout_session", {
  sessionToken: text("sessionToken").primaryKey(),
  userId: uuid("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { mode: "date", withTimezone: true }).notNull(),
}).enableRLS();

export const verificationTokens = pgTable(
  "scout_verification_token",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { mode: "date", withTimezone: true }).notNull(),
  },
  (vt) => [primaryKey({ columns: [vt.identifier, vt.token] })]
).enableRLS();
