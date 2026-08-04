import { date, integer, numeric, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

/**
 * READ-ONLY mirror of spectral-ops's `pilots` table -- same physical table,
 * same physical database, spectral-ops owns it and migrates it, this app
 * only ever SELECTs from it. Same pattern as spectral-pilot/db/pilots-mirror.ts.
 * Deliberately excluded from drizzle.config.ts's `schema` array so
 * db:generate/db:migrate here never try to create, alter, or drop it.
 *
 * Only used to resolve/display program details for organizations with
 * accountTier = 'pilot' (organizations.pilotKey). If spectral-ops's
 * db/schema.ts `pilots` table shape changes, this mirror goes stale
 * silently -- check that file first if pilot-tier org data looks wrong.
 */
export const pilotStatusEnum = pgEnum("pilot_status", ["discussion", "active", "converted", "ended"]);

export const pilotsMirror = pgTable("pilots", {
  id: uuid("id").primaryKey(),
  name: text("name").notNull(),
  pilotUnits: integer("pilot_units").notNull(),
  purchasedUnits: integer("purchased_units").notNull(),
  purchaseRevenue: numeric("purchase_revenue", { mode: "number" }).notNull(),
  startDate: date("start_date", { mode: "string" }),
  durationMo: integer("duration_mo").notNull(),
  status: pilotStatusEnum("status").notNull(),
  sheetRowKey: text("sheet_row_key"), // this is the "pilotKey" scout_organization references by value
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
});
