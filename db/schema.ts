import {
  boolean,
  date,
  index,
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

// One row per (user, org) -- real multi-user orgs now (team invites below),
// not just a join table modeled ahead of need. "owner" doubles as
// SCHEDULING.md's "manager" role (can assign/reassign tasks, invite/remove
// members) and "member" as "scout" (own tasks + shared read-only schedule) --
// deliberately not a separate role column, since the two concepts are the
// same permission split under different names.
export const memberships = pgTable(
  "scout_membership",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Unique, not just indexed: "1 user = 1 org" today (see comment above),
    // and the constraint is what makes provisioning race-safe -- auth.ts's
    // session callback used to select-then-insert, which two concurrent
    // first-sign-in requests could both pass (both see no row, both insert)
    // and end up with two orgs for one person. Now backed by
    // .onConflictDoNothing() targeting this constraint, so only one insert
    // can ever win regardless of timing.
    userId: uuid("user_id").notNull().unique(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    role: membershipRoleEnum("role").notNull().default("owner"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("scout_membership_organization_id_idx").on(table.organizationId)]
).enableRLS();

// A pending team invite -- an email with no scout_user row yet (they've
// never signed in). Consumed by auth.ts's session callback on that email's
// first sign-in: instead of the normal self-serve path (new org, owner
// role), it joins the inviting org at the invited role and deletes itself.
// Keyed by email, not userId, since the whole point is the person doesn't
// have an account yet.
export const invites = pgTable(
  "scout_invite",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: membershipRoleEnum("role").notNull().default("member"),
    invitedByUserId: uuid("invited_by_user_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("scout_invite_organization_id_idx").on(table.organizationId), index("scout_invite_email_idx").on(table.email)]
).enableRLS();

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

export const facilities = pgTable(
  "scout_facility",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("scout_facility_organization_id_idx").on(table.organizationId)]
).enableRLS();

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
export const facilityAreas = pgTable(
  "scout_facility_area",
  {
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
  },
  (table) => [index("scout_facility_area_facility_id_idx").on(table.facilityId)]
).enableRLS();

// Generic canvas object -- deliberately NOT one table per shape type
// (bench/row/table/room). geometry/style/metadata are jsonb so a grower can
// draw and label whatever their facility actually looks like without a
// schema migration every time someone's layout doesn't fit a predefined
// shape. Same pattern Figma/tldraw/Miro use for canvas objects.
export const shapeTypeEnum = pgEnum("scout_shape_type", ["rect", "polygon", "circle", "line", "label"]);

export const facilityMapObjects = pgTable(
  "scout_facility_map_object",
  {
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
  },
  (table) => [index("scout_facility_map_object_facility_area_id_idx").on(table.facilityAreaId)]
).enableRLS();

// ---------------------------------------------------------------------------
// Inventory: beneficials, biopesticides, chemical products
// ---------------------------------------------------------------------------

export const inventoryCategoryEnum = pgEnum("scout_inventory_category", ["beneficial", "biopesticide", "chemical"]);

// Org-wide, not per-facility -- v1 IPM orgs on this app run effectively one
// operation (see scout_membership's comment: "1 user = 1 org" today), and a
// shared stock pool matches how a single grower actually manages product
// across whatever facilities they have. Revisit if/when the app needs to
// support an org with genuinely separate stock rooms per site.
export const inventoryItems = pgTable(
  "scout_inventory_item",
  {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  category: inventoryCategoryEnum("category").notNull(),
  name: text("name").notNull(),
  scientificName: text("scientific_name"),
  unit: text("unit").notNull(), // "units", "L", "kg" -- freeform, set by the catalog entry or a custom add
  quantity: numeric("quantity", { mode: "number" }).notNull().default(0),
  reorderLevel: numeric("reorder_level", { mode: "number" }), // null = never flagged low
  reiHours: integer("rei_hours"), // chemical only
  phiDays: integer("phi_days"), // chemical only
  // Safety notes carried over from the catalog entry (e.g. "never combine
  // with oils within ~2 weeks") -- surfaced when adding/using the item
  // rather than discarded after the add flow, given how directly
  // treatments.json ties these to real application-safety risk.
  cautions: text("cautions"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("scout_inventory_item_organization_id_idx").on(table.organizationId)]
).enableRLS();

// A pending restock -- separate from inventoryItems.quantity so "on order"
// can show supplier/ETA without touching on-hand stock until it actually
// arrives (see the orders/[orderId]/receive route, which deletes the row
// and adds its quantity to the item in one action).
export const inventoryOrders = pgTable(
  "scout_inventory_order",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    itemId: uuid("item_id")
      .notNull()
      .references(() => inventoryItems.id, { onDelete: "cascade" }),
    quantity: numeric("quantity", { mode: "number" }).notNull(),
    supplier: text("supplier"),
    expectedAt: date("expected_at", { mode: "string" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("scout_inventory_order_item_id_idx").on(table.itemId)]
).enableRLS();

// ---------------------------------------------------------------------------
// Pest events, scouting, treatments
// ---------------------------------------------------------------------------

export const severityEnum = pgEnum("scout_severity", ["low", "moderate", "high", "severe"]);
export const pestEventStatusEnum = pgEnum("scout_pest_event_status", ["active", "resolved"]);
// Disease/pathogen outbreaks share the exact same lifecycle as a pest
// infestation (detected -> monitored -> treated -> resolved), same map pin,
// same timeline, same treatments -- this is the "everything is a Pest
// Event, different views onto the same object" model, extended with a
// discriminator instead of a parallel table. `kind` is the only thing that
// changes what an assessment session means (see assessmentTypeEnum below).
export const eventKindEnum = pgEnum("scout_event_kind", ["pest", "pathogen"]);

// The central object per the product brief: every infestation is its own
// living record that scouting observations, treatments, and photos attach
// to, rather than scattering related rows with no shared parent.
//
// Location is a raw (x, y) on the area's canvas -- a dropped pin -- NOT a
// hard foreign key to one specific drawn object. If a grower later resizes
// or deletes that bench, the pest event shouldn't become orphaned or
// invalid. mapObjectId is an optional convenience reference (e.g. "this pin
// was dropped on Bench 4") for label/snapping purposes only.
export const pestEvents = pgTable(
  "scout_pest_event",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    facilityId: uuid("facility_id")
      .notNull()
      .references(() => facilities.id, { onDelete: "cascade" }),
    facilityAreaId: uuid("facility_area_id").references(() => facilityAreas.id, { onDelete: "set null" }),
    mapObjectId: uuid("map_object_id").references(() => facilityMapObjects.id, { onDelete: "set null" }),
    x: numeric("x", { mode: "number" }),
    y: numeric("y", { mode: "number" }),
    kind: eventKindEnum("kind").notNull().default("pest"),
    pestSpecies: text("pest_species").notNull(), // common name either way -- insect species name, or disease/pathogen name
    scientificName: text("scientific_name"), // optional Latin binomial, either kind
    severity: severityEnum("severity").notNull().default("moderate"),
    status: pestEventStatusEnum("status").notNull().default("active"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    // Set only when maybeAutoResolve (lib/threshold-engine.ts) closed this
    // event itself -- distinguishes "the grower resolved this, they
    // already know" from "the system resolved this while they weren't
    // looking," which is the case that actually needs a notification.
    autoResolved: boolean("auto_resolved").notNull().default(false),
  },
  (table) => [
    index("scout_pest_event_facility_id_idx").on(table.facilityId),
    index("scout_pest_event_facility_area_id_idx").on(table.facilityAreaId),
    index("scout_pest_event_status_idx").on(table.status),
  ]
).enableRLS();

export const deviceStatusEnum = pgEnum("scout_device_status", ["working", "needs_attention", "down"]);
export const plantHealthEnum = pgEnum("scout_plant_health", ["normal", "phytotoxicity_observed", "other_concern"]);

// Routine scouting stays independent from Pest Events -- a scout logs
// observations while walking a facility, and if one identifies a meaningful
// infestation it gets promoted into a Pest Event (promotedPestEventId).
// Field shape is ported from spectral-pilot's pp_reports (proven UX, since
// updated there to a live-editable 10-plant x 3-leaf grid with environmental
// readings -- ported again here to match). deviceStatus/satisfactionRating
// stay nullable/pilot-tier-only since most Scout users have no Spectral
// hardware and no pilot relationship to rate; sampleSize/pestCount are the
// leavesChecked/leavesInfested rollup of leafGrid (still what the trend/
// density displays elsewhere in the app read), leafGrid is the raw grid for
// anything that wants the full per-leaf detail later.
// Which protocol produced this session's leafGrid -- pest_count grid is
// unchecked/absent/low/medium/high per leaf (aggregateLeafGrid in
// lib/density.ts); disease_severity grid is null/0-4 percent-leaf-area
// classes per leaf (aggregateDiseaseGrid in lib/disease.ts). Without this,
// a disease event's grid would be silently misread by the pest aggregator
// (or vice versa) since leafGrid itself is untyped jsonb.
export const assessmentTypeEnum = pgEnum("scout_assessment_type", ["pest_count", "disease_severity"]);

export const scoutingObservations = pgTable(
  "scout_observation",
  {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  facilityAreaId: uuid("facility_area_id")
    .notNull()
    .references(() => facilityAreas.id, { onDelete: "cascade" }),
  // Bay-keyed, same dropped-pin convention as pestEvents.x/y -- this is what
  // makes the dashboard map's Last scouted/Temp/Humidity lenses possible
  // (ARCHITECTURE.md section 7: "samples are bay-keyed"). Nullable: an event-linked
  // monitoring session inherits its parent event's x/y automatically (the
  // location is already known -- see the monitoring POST route), and a
  // general session's location stays optional the same way temp/humidity
  // already are, so a quick walkthrough is never blocked on placing a pin.
  x: numeric("x", { mode: "number" }),
  y: numeric("y", { mode: "number" }),
  submittedByUserId: uuid("submitted_by_user_id").notNull(),
  date: date("date", { mode: "string" }).notNull(),
  assessmentType: assessmentTypeEnum("assessment_type").notNull().default("pest_count"),
  sampleSize: integer("sample_size"),
  pestCount: integer("pest_count"),
  leafGrid: jsonb("leaf_grid"), // shape depends on assessmentType -- see enum comment above
  avgTempF: integer("avg_temp_f"),
  avgHumidityPct: integer("avg_humidity_pct"),
  avgLightHrs: integer("avg_light_hrs"),
  deviceStatus: deviceStatusEnum("device_status"), // pilot-tier orgs with Spectral hardware only
  plantHealthFlag: plantHealthEnum("plant_health_flag"),
  weatherNotes: text("weather_notes"), // superseded by avgTempF/avgHumidityPct/avgLightHrs above; kept, unused by current UI
  otherTreatmentsNotes: text("other_treatments_notes"),
  notes: text("notes"),
  satisfactionRating: integer("satisfaction_rating"), // 1-5, pilot-tier only
  promotedPestEventId: uuid("promoted_pest_event_id").references(() => pestEvents.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("scout_observation_organization_id_idx").on(table.organizationId),
    index("scout_observation_facility_area_id_idx").on(table.facilityAreaId),
    index("scout_observation_promoted_pest_event_id_idx").on(table.promotedPestEventId),
  ]
).enableRLS();

export const observationPhotos = pgTable(
  "scout_observation_photo",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    observationId: uuid("observation_id").references(() => scoutingObservations.id, { onDelete: "set null" }),
    pestEventId: uuid("pest_event_id").references(() => pestEvents.id, { onDelete: "set null" }),
    blobUrl: text("blob_url").notNull(),
    caption: text("caption"),
    uploadedAt: timestamp("uploaded_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("scout_observation_photo_observation_id_idx").on(table.observationId),
    index("scout_observation_photo_pest_event_id_idx").on(table.pestEventId),
  ]
).enableRLS();

// Chemical pesticide applications, biological releases, and (eventually)
// Spectral light treatments all share this one model per the product brief
// -- "Spectral treatments should eventually be generated automatically by
// connected hardware" implies this table needs to accept machine-written
// rows later, not just human-entered ones, hence operatorUserId is nullable.
export const treatmentTypeEnum = pgEnum("scout_treatment_type", ["pesticide", "biological", "spectral_light"]);

export const treatments = pgTable(
  "scout_treatment",
  {
  id: uuid("id").primaryKey().defaultRandom(),
  facilityId: uuid("facility_id")
    .notNull()
    .references(() => facilities.id, { onDelete: "cascade" }),
  pestEventId: uuid("pest_event_id").references(() => pestEvents.id, { onDelete: "set null" }),
  // Dropped pin, same convention as pestEvents/scoutingObservations --
  // only set for a *standalone* treatment (no pestEventId, e.g. a routine
  // biocontrol release with no infestation behind it). An event-scoped
  // treatment inherits its parent event's x/y at read time instead (see
  // lib/rei-phi.ts) rather than duplicating it here.
  x: numeric("x", { mode: "number" }),
  y: numeric("y", { mode: "number" }),
  type: treatmentTypeEnum("type").notNull(),
  product: text("product"),
  targetPest: text("target_pest"),
  // Links to the real stock record when the product was picked from
  // Inventory (vs. typed freehand) -- this is what lets applying a
  // treatment decrement stock and, for a chemical with REI/PHI set on its
  // item, start the re-entry/harvest countdowns (lib/rei-phi.ts).
  inventoryItemId: uuid("inventory_item_id").references(() => inventoryItems.id, { onDelete: "set null" }),
  quantityUsed: numeric("quantity_used", { mode: "number" }),
  operatorUserId: uuid("operator_user_id"),
  appliedAt: timestamp("applied_at", { withTimezone: true }).notNull().defaultNow(),
  notes: text("notes"),
  // Labor tracking -- an "Application log" per ARCHITECTURE.md's create
  // sheet captures time spent same as a completed Task does (see
  // scout_task.minutesSpent's comment on why this stays operation-owned,
  // not pooled into any cross-org aggregate).
  minutesSpent: integer("minutes_spent"),
  },
  (table) => [
    index("scout_treatment_facility_id_idx").on(table.facilityId),
    index("scout_treatment_pest_event_id_idx").on(table.pestEventId),
    index("scout_treatment_inventory_item_id_idx").on(table.inventoryItemId),
  ]
).enableRLS();

// ---------------------------------------------------------------------------
// Sticky traps
// ---------------------------------------------------------------------------

// A trap is a persistent, located object -- unlike a scouting observation
// (one-off session) or a pest event (an infestation), a trap sits in one
// spot in the facility indefinitely and accumulates a reading history over
// time. Location reuses the exact same raw (x, y) canvas-space convention as
// pestEvents (see that table's comment) for the same reason: a dropped pin,
// not a hard FK to a drawn bench, so resizing/deleting map objects can't
// orphan a trap. label is grower-facing ("Trap 1"), auto-numbered per area
// at creation time but editable.
export const traps = pgTable(
  "scout_trap",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    facilityId: uuid("facility_id")
      .notNull()
      .references(() => facilities.id, { onDelete: "cascade" }),
    facilityAreaId: uuid("facility_area_id")
      .notNull()
      .references(() => facilityAreas.id, { onDelete: "cascade" }),
    x: numeric("x", { mode: "number" }).notNull(),
    y: numeric("y", { mode: "number" }).notNull(),
    label: text("label").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("scout_trap_facility_id_idx").on(table.facilityId), index("scout_trap_facility_area_id_idx").on(table.facilityAreaId)]
).enableRLS();

// One row per trap per check -- count + daysDeployed (since the trap was
// last reset/checked) is what a grower actually reads off a sticky card;
// catch-per-day is derived from these two at read time (lib/trap-alerts.ts)
// rather than stored, so there's no derived column that can drift out of
// sync with its inputs. pestSpecies is chosen once per reading *session*
// (a grower checks a whole trap network for one target pest in a pass, per
// the "Log trap readings" flow), not stored on the trap itself, since the
// same physical trap can be read for different pests over its life.
export const trapReadings = pgTable(
  "scout_trap_reading",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    trapId: uuid("trap_id")
      .notNull()
      .references(() => traps.id, { onDelete: "cascade" }),
    pestSpecies: text("pest_species").notNull(),
    count: integer("count").notNull(),
    daysDeployed: integer("days_deployed").notNull(),
    submittedByUserId: uuid("submitted_by_user_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("scout_trap_reading_trap_id_idx").on(table.trapId)]
).enableRLS();

// Per-pest catch/day threshold, org-configurable -- answers "should
// over-threshold be a global switch or per-pest": per-pest, keyed by
// species name (case-insensitive match, see lib/trap-alerts.ts), because
// some pests are naturally spiky on traps (thrips, fungus gnats swing with
// weather/vent cycles) where a fixed low threshold would flood Attention
// Required with noise, while others are rare enough that any catch is a
// real signal. No UI writes this table yet in v1 (a sensible default
// constant covers species with no row -- see DEFAULT_CATCH_PER_DAY_THRESHOLD
// in lib/trap-alerts.ts) but nothing in the model blocks adding a settings
// screen for it later.
export const trapThresholds = pgTable(
  "scout_trap_threshold",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    pestSpecies: text("pest_species").notNull(),
    catchPerDayThreshold: numeric("catch_per_day_threshold", { mode: "number" }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("scout_trap_threshold_organization_id_idx").on(table.organizationId)]
).enableRLS();

// ---------------------------------------------------------------------------
// Scheduling & tasks
// ---------------------------------------------------------------------------

// scout | monitor | release | treatment | trap_read | sulfur | sanitation |
// test | other -- per SCHEDULING.md's Task object.
export const taskTypeEnum = pgEnum("scout_task_type", [
  "scout",
  "monitor",
  "release",
  "treatment",
  "trap_read",
  "sulfur",
  "sanitation",
  "test",
  "other",
]);
// manual (a person created it) | auto_program (generated from a treatment
// program's follow-up cadence) | auto_trigger (e.g. a trap-spike watchdog).
// Only "manual" is actually produced yet -- the recommendation engine that
// would apply a program and spawn auto_program tasks is deliberately not
// built this pass (see lib/inventory-catalog.ts's comment on why), but the
// column exists now so that doesn't require a migration later.
export const taskSourceEnum = pgEnum("scout_task_source", ["manual", "auto_program", "auto_trigger"]);
// "overdue" is deliberately not a stored state -- it's dueAt < now on an
// "open" task, computed at read time (lib/tasks.ts) so it's never stale.
export const taskStatusEnum = pgEnum("scout_task_status", ["open", "done", "snoozed"]);

export const tasks = pgTable(
  "scout_task",
  {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  type: taskTypeEnum("type").notNull().default("other"),
  facilityId: uuid("facility_id").references(() => facilities.id, { onDelete: "cascade" }),
  facilityAreaId: uuid("facility_area_id").references(() => facilityAreas.id, { onDelete: "set null" }),
  // Optional -- a routine scout route or trap-read task has no infestation
  // behind it. When set, the task detail screen can show the linked event
  // and "complete" can route into that event's monitoring flow.
  pestEventId: uuid("pest_event_id").references(() => pestEvents.id, { onDelete: "set null" }),
  // Bay-keyed, inherited from pestEventId when linked (same "inherit the
  // parent event's pin" convention as scout_treatment.x/y) -- what lets
  // task creation check "is this bay under an active REI restriction right
  // now" (SCHEDULING.md: chemical treatments "block entry/harvest-type
  // tasks on that bay until cleared"). A manually created task with no
  // linked event has no bay, so it isn't blockable this way -- a known,
  // disclosed gap rather than a half-built location picker bolted onto the
  // task form for a v1 pass.
  x: numeric("x", { mode: "number" }),
  y: numeric("y", { mode: "number" }),
  // Matched-by-value against scout_user.id, not a real FK -- same
  // convention as scout_membership.userId and scout_treatment.operatorUserId
  // (see those tables' comments). Null assignee = unassigned, manager triage.
  assigneeUserId: uuid("assignee_user_id"),
  createdByUserId: uuid("created_by_user_id"),
  source: taskSourceEnum("source").notNull().default("manual"),
  dueAt: timestamp("due_at", { withTimezone: true }).notNull(),
  repeatEveryDays: integer("repeat_every_days"),
  status: taskStatusEnum("status").notNull().default("open"),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  completedByUserId: uuid("completed_by_user_id"),
  // Labor tracking (SCHEDULING.md, section "Time tracking on completion") --
  // operation-owned data, visible only to that operation's managers, never
  // shared to any cross-org aggregate at this granularity (DATA_CONSENT.md).
  minutesSpent: integer("minutes_spent"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("scout_task_organization_id_idx").on(table.organizationId),
    index("scout_task_facility_id_idx").on(table.facilityId),
    index("scout_task_facility_area_id_idx").on(table.facilityAreaId),
    index("scout_task_pest_event_id_idx").on(table.pestEventId),
    index("scout_task_assignee_user_id_idx").on(table.assigneeUserId),
    index("scout_task_status_idx").on(table.status),
  ]
).enableRLS();

// Per-pest infested/incidence % threshold -- the ThresholdEngine's
// non-trap counterpart to scout_trap_threshold (see that table's comment
// for why per-pest, org-configurable, not a single global switch). Plant
// sampling, Counts, and disease assessment all converge on the same
// sampleSize/pestCount shape (ARCHITECTURE.md ยง3's "convergence rule"),
// so one metric (infested % = pestCount/sampleSize) covers all three --
// no separate metric-type column needed. DEFAULT_INFESTED_PCT_THRESHOLD
// in lib/threshold-engine.ts covers any species with no row. Written from
// /app/settings/catalog (owner role) -- getSpeciesThreshold,
// computeMonitoringAlerts, maybeAutoResolve, and computeEscalationAlerts
// all already read this table live, so a row written here takes effect
// everywhere immediately, no other code changes needed.
export const monitoringThresholds = pgTable(
  "scout_monitoring_threshold",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    pestSpecies: text("pest_species").notNull(),
    infestedPctThreshold: numeric("infested_pct_threshold", { mode: "number" }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("scout_monitoring_threshold_organization_id_idx").on(table.organizationId)]
).enableRLS();

// Org-added species/pathogens that aren't in the built-in PEST_CATALOG
// (lib/pest-catalog.ts) -- SpeciesPicker was already never blocked on a
// catalog match (freeform text always worked), but a name typed once
// wasn't remembered or suggested again. This is deliberately just a
// name + kind, not a full custom treatment program: PEST_CATALOG's
// treatment programs (lib/treatments-catalog.ts -- preventive/
// biocontrol/biopesticide/chemical tiers, follow-up cadences) are a much
// larger nested-data-entry problem, scoped out as its own follow-up. A
// custom species with no program still works everywhere -- monitoring,
// thresholds, auto-resolve, escalation -- it just won't have
// RecommendationsPanel suggestions, same as any species the app has
// never heard of already gets today (see RecommendationsPanel's "no
// preset program" fallback).
export const customSpecies = pgTable(
  "scout_custom_species",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    kind: eventKindEnum("kind").notNull().default("pest"),
    commonName: text("common_name").notNull(),
    scientificName: text("scientific_name"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("scout_custom_species_organization_id_idx").on(table.organizationId)]
).enableRLS();
