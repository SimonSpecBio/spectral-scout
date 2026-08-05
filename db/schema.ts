import {
  date,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// Organizations & membership
// ---------------------------------------------------------------------------

// The core visibility boundary: 'pilot' orgs are real Spectral pilot-program
// customers (contractual relationship, staff already has full per-org
// drill-down for these under spectral-pilot). 'general' orgs are anyone who
// signed up for the free tool with no relationship to Spectral -- staff-facing
// routes must refuse to return org-identifiable detail for these by
// construction (see lib/session.ts), not just hide it in the UI. Aggregated/
// anonymized stats are the only thing staff ever see for 'general' orgs.
export const accountTierEnum = pgEnum("scout_account_tier", ["general", "pilot"]);

// Every table in this file is .enableRLS() -- this app's Postgres instance
// is shared with spectral-ops/spectral-pilot/spectral-rnd, and Supabase
// auto-exposes every public-schema table via its REST API regardless of how
// the app itself connects. This app only ever uses a direct DATABASE_URL
// Postgres connection, so RLS with zero policies fully blocks the public API
// without affecting the app. Same fix already applied to the other three
// apps' tables -- see spectral-ops's "Enable RLS on all tables to close
// public API exposure" commit. Missing this here was a real gap (Supabase's
// security scanner caught scout_organization/scout_facility/etc. publicly
// readable/writable), not a style choice -- never add a table to this file
// without it.
export const organizations = pgTable("scout_organization", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  accountTier: accountTierEnum("account_tier").notNull().default("general"),
  // Loose reference to spectral-ops's pilots.sheet_row_key, same
  // matched-by-value (not a real FK) pattern spectral-pilot's
  // db/pilots-mirror.ts already uses -- only meaningful when
  // accountTier = 'pilot'.
  pilotKey: text("pilot_key"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}).enableRLS();

export const membershipRoleEnum = pgEnum("scout_membership_role", ["owner", "member"]);

// One row per (user, org). v1 is effectively 1 user = 1 org (nothing in the
// app UI supports inviting a second member yet), but modeling it as a join
// table now means adding multi-user orgs later is a UI change, not a schema
// migration + data backfill.
export const memberships = pgTable("scout_membership", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  role: membershipRoleEnum("role").notNull().default("owner"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}).enableRLS();

// Internal Spectral staff (Google-login, allowlist-gated same as
// spectral-ops/spectral-rnd) -- separate from organizations/memberships,
// which are all external grower accounts.
export const staffRoleEnum = pgEnum("scout_staff_role", ["staff"]);

export const staff = pgTable("scout_staff", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().unique(),
  role: staffRoleEnum("role").notNull().default("staff"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}).enableRLS();

// ---------------------------------------------------------------------------
// Facilities
// ---------------------------------------------------------------------------

export const facilities = pgTable("scout_facility", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}).enableRLS();

export const areaKindEnum = pgEnum("scout_area_kind", [
  "building",
  "greenhouse",
  "flowering_room",
  "propagation_room",
  "growing_bay",
  "other",
]);

// One drawable canvas per area. backgroundImageUrl/backgroundScale support
// tracing over an uploaded blueprint photo or a satellite image fetched by
// address, instead of drawing a layout from a blank canvas -- both use the
// same mechanism, just a different image source. backgroundScale is real-
// world units (feet) per canvas unit, set once at creation: retrofitting
// real-world scale after growers have already drawn layouts in arbitrary
// pixel space is painful, so this is captured from day one even before any
// feature (e.g. fixture-coverage overlays) actually uses it.
export const facilityAreas = pgTable("scout_facility_area", {
  id: uuid("id").primaryKey().defaultRandom(),
  facilityId: uuid("facility_id")
    .notNull()
    .references(() => facilities.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  kind: areaKindEnum("kind").notNull().default("other"),
  cropType: text("crop_type"),
  notes: text("notes"),
  backgroundImageUrl: text("background_image_url"),
  backgroundScale: numeric("background_scale", { mode: "number" }), // feet per canvas unit
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}).enableRLS();

// Generic canvas object -- deliberately NOT one table per shape type
// (bench/row/table/room). geometry/style/metadata are jsonb so a grower can
// draw and label whatever their facility actually looks like without a
// schema migration every time someone's layout doesn't fit a predefined
// shape. Same pattern Figma/tldraw/Miro use for canvas objects.
export const shapeTypeEnum = pgEnum("scout_shape_type", ["rect", "polygon", "circle", "line", "label"]);

export const facilityMapObjects = pgTable("scout_facility_map_object", {
  id: uuid("id").primaryKey().defaultRandom(),
  facilityAreaId: uuid("facility_area_id")
    .notNull()
    .references(() => facilityAreas.id, { onDelete: "cascade" }),
  shapeType: shapeTypeEnum("shape_type").notNull(),
  geometry: jsonb("geometry").notNull(), // { x, y, width, height, rotation } | { points: [...] } | etc, shape-dependent
  style: jsonb("style"), // { fill, stroke, strokeWidth, opacity }
  label: text("label"),
  metadata: jsonb("metadata"), // grower-defined freeform key/values (capacity, notes, whatever)
  zIndex: integer("z_index").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}).enableRLS();

// ---------------------------------------------------------------------------
// Pest events, scouting, treatments
// ---------------------------------------------------------------------------

export const severityEnum = pgEnum("scout_severity", ["low", "moderate", "high", "severe"]);
export const pestEventStatusEnum = pgEnum("scout_pest_event_status", ["active", "resolved"]);

// The central object per the product brief: every infestation is its own
// living record that scouting observations, treatments, and photos attach
// to, rather than scattering related rows with no shared parent.
//
// Location is a raw (x, y) on the area's canvas -- a dropped pin -- NOT a
// hard foreign key to one specific drawn object. If a grower later resizes
// or deletes that bench, the pest event shouldn't become orphaned or
// invalid. mapObjectId is an optional convenience reference (e.g. "this pin
// was dropped on Bench 4") for label/snapping purposes only.
export const pestEvents = pgTable("scout_pest_event", {
  id: uuid("id").primaryKey().defaultRandom(),
  facilityId: uuid("facility_id")
    .notNull()
    .references(() => facilities.id, { onDelete: "cascade" }),
  facilityAreaId: uuid("facility_area_id").references(() => facilityAreas.id, { onDelete: "set null" }),
  mapObjectId: uuid("map_object_id").references(() => facilityMapObjects.id, { onDelete: "set null" }),
  x: numeric("x", { mode: "number" }),
  y: numeric("y", { mode: "number" }),
  pestSpecies: text("pest_species").notNull(),
  severity: severityEnum("severity").notNull().default("moderate"),
  status: pestEventStatusEnum("status").notNull().default("active"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
}).enableRLS();

export const deviceStatusEnum = pgEnum("scout_device_status", ["working", "needs_attention", "down"]);
export const plantHealthEnum = pgEnum("scout_plant_health", ["normal", "phytotoxicity_observed", "other_concern"]);

// Routine scouting stays independent from Pest Events -- a scout logs
// observations while walking a facility, and if one identifies a meaningful
// infestation it gets promoted into a Pest Event (promotedPestEventId).
// Field shape is ported from spectral-pilot's pp_reports (proven UX), but
// deviceStatus/satisfactionRating are nullable here since most Scout users
// have no Spectral hardware and no pilot relationship to rate -- the UI only
// shows those fields when the org's accountTier is 'pilot'.
export const scoutingObservations = pgTable("scout_observation", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  facilityAreaId: uuid("facility_area_id")
    .notNull()
    .references(() => facilityAreas.id, { onDelete: "cascade" }),
  submittedByUserId: uuid("submitted_by_user_id").notNull(),
  date: date("date", { mode: "string" }).notNull(),
  sampleSize: integer("sample_size"),
  pestCount: integer("pest_count"),
  deviceStatus: deviceStatusEnum("device_status"), // pilot-tier orgs with Spectral hardware only
  plantHealthFlag: plantHealthEnum("plant_health_flag"),
  weatherNotes: text("weather_notes"),
  otherTreatmentsNotes: text("other_treatments_notes"),
  notes: text("notes"),
  satisfactionRating: integer("satisfaction_rating"), // 1-5, pilot-tier only
  promotedPestEventId: uuid("promoted_pest_event_id").references(() => pestEvents.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}).enableRLS();

export const observationPhotos = pgTable("scout_observation_photo", {
  id: uuid("id").primaryKey().defaultRandom(),
  observationId: uuid("observation_id").references(() => scoutingObservations.id, { onDelete: "set null" }),
  pestEventId: uuid("pest_event_id").references(() => pestEvents.id, { onDelete: "set null" }),
  blobUrl: text("blob_url").notNull(),
  caption: text("caption"),
  uploadedAt: timestamp("uploaded_at", { withTimezone: true }).notNull().defaultNow(),
}).enableRLS();

// Chemical pesticide applications, biological releases, and (eventually)
// Spectral light treatments all share this one model per the product brief
// -- "Spectral treatments should eventually be generated automatically by
// connected hardware" implies this table needs to accept machine-written
// rows later, not just human-entered ones, hence operatorUserId is nullable.
export const treatmentTypeEnum = pgEnum("scout_treatment_type", ["pesticide", "biological", "spectral_light"]);

export const treatments = pgTable("scout_treatment", {
  id: uuid("id").primaryKey().defaultRandom(),
  facilityId: uuid("facility_id")
    .notNull()
    .references(() => facilities.id, { onDelete: "cascade" }),
  pestEventId: uuid("pest_event_id").references(() => pestEvents.id, { onDelete: "set null" }),
  type: treatmentTypeEnum("type").notNull(),
  product: text("product"),
  targetPest: text("target_pest"),
  operatorUserId: uuid("operator_user_id"),
  appliedAt: timestamp("applied_at", { withTimezone: true }).notNull().defaultNow(),
  notes: text("notes"),
}).enableRLS();
