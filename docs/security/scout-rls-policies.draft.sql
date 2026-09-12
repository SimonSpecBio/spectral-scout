-- =============================================================================
-- DRAFT — DO NOT APPLY TO PRODUCTION. NOT A MIGRATION.
-- =============================================================================
-- Task 069 design artifact. Deliberately placed under docs/ (NOT in ./drizzle)
-- so it can never enter the migration chain or be picked up by db:migrate.
-- It is a reviewed starting point for the RLS policies described in
-- tenant-isolation-rollout.md, to be completed and validated on an ISOLATED
-- CLONE as the `scout_app` role before any real migration is authored.
--
-- Two policy shapes cover every scout_* tenant table:
--   (A) direct  — table has organization_id.
--   (B) derived — table is facility/parent-scoped; org is resolved by join.
-- The tenant id is read from a transaction-local GUC set by the runtime:
--   select set_config('app.current_org', '<org-uuid>', true);   -- is_local=true
-- current_setting(..., true) returns NULL when unset, so every policy below
-- FAILS CLOSED (no rows / rejected write) on a connection with no context.
-- =============================================================================

-- Helper expression (inlined per policy; shown once here for reference):
--   nullif(current_setting('app.current_org', true), '')::uuid

-- ---------------------------------------------------------------------------
-- (A) Direct organization_id tables — representative set.
--     Remaining direct tables follow the identical pattern:
--     scout_membership, scout_invite, scout_establishment_check,
--     scout_trap_threshold, scout_monitoring_threshold, scout_custom_species,
--     and any other scout_* table that carries organization_id.
-- ---------------------------------------------------------------------------

ALTER TABLE scout_facility        ENABLE ROW LEVEL SECURITY;
ALTER TABLE scout_facility        FORCE  ROW LEVEL SECURITY;   -- Phase 4 only
CREATE POLICY scout_facility_tenant ON scout_facility
  USING      (organization_id = nullif(current_setting('app.current_org', true), '')::uuid)
  WITH CHECK (organization_id = nullif(current_setting('app.current_org', true), '')::uuid);

ALTER TABLE scout_inventory_item  ENABLE ROW LEVEL SECURITY;
ALTER TABLE scout_inventory_item  FORCE  ROW LEVEL SECURITY;
CREATE POLICY scout_inventory_item_tenant ON scout_inventory_item
  USING      (organization_id = nullif(current_setting('app.current_org', true), '')::uuid)
  WITH CHECK (organization_id = nullif(current_setting('app.current_org', true), '')::uuid);

ALTER TABLE scout_task            ENABLE ROW LEVEL SECURITY;
ALTER TABLE scout_task            FORCE  ROW LEVEL SECURITY;
CREATE POLICY scout_task_tenant ON scout_task
  USING      (organization_id = nullif(current_setting('app.current_org', true), '')::uuid)
  WITH CHECK (organization_id = nullif(current_setting('app.current_org', true), '')::uuid);

ALTER TABLE scout_observation     ENABLE ROW LEVEL SECURITY;
ALTER TABLE scout_observation     FORCE  ROW LEVEL SECURITY;
CREATE POLICY scout_observation_tenant ON scout_observation
  USING      (organization_id = nullif(current_setting('app.current_org', true), '')::uuid)
  WITH CHECK (organization_id = nullif(current_setting('app.current_org', true), '')::uuid);

-- scout_organization keys on id (the org IS the tenant boundary).
ALTER TABLE scout_organization    ENABLE ROW LEVEL SECURITY;
ALTER TABLE scout_organization    FORCE  ROW LEVEL SECURITY;
CREATE POLICY scout_organization_tenant ON scout_organization
  USING      (id = nullif(current_setting('app.current_org', true), '')::uuid)
  WITH CHECK (id = nullif(current_setting('app.current_org', true), '')::uuid);

-- ---------------------------------------------------------------------------
-- (B) Facility/parent-scoped tables — org resolved by join.
--     Applies to: scout_facility_area, scout_facility_map_object (via area),
--     scout_pest_event, scout_treatment, scout_trap, scout_trap_reading
--     (via trap), scout_observation_photo (via observation),
--     scout_inventory_order (via item).
-- ---------------------------------------------------------------------------

ALTER TABLE scout_facility_area   ENABLE ROW LEVEL SECURITY;
ALTER TABLE scout_facility_area   FORCE  ROW LEVEL SECURITY;
CREATE POLICY scout_facility_area_tenant ON scout_facility_area
  USING (EXISTS (
    SELECT 1 FROM scout_facility f
    WHERE f.id = scout_facility_area.facility_id
      AND f.organization_id = nullif(current_setting('app.current_org', true), '')::uuid))
  WITH CHECK (EXISTS (
    SELECT 1 FROM scout_facility f
    WHERE f.id = scout_facility_area.facility_id
      AND f.organization_id = nullif(current_setting('app.current_org', true), '')::uuid));

ALTER TABLE scout_pest_event      ENABLE ROW LEVEL SECURITY;
ALTER TABLE scout_pest_event      FORCE  ROW LEVEL SECURITY;
CREATE POLICY scout_pest_event_tenant ON scout_pest_event
  USING (EXISTS (
    SELECT 1 FROM scout_facility f
    WHERE f.id = scout_pest_event.facility_id
      AND f.organization_id = nullif(current_setting('app.current_org', true), '')::uuid))
  WITH CHECK (EXISTS (
    SELECT 1 FROM scout_facility f
    WHERE f.id = scout_pest_event.facility_id
      AND f.organization_id = nullif(current_setting('app.current_org', true), '')::uuid));

ALTER TABLE scout_treatment       ENABLE ROW LEVEL SECURITY;
ALTER TABLE scout_treatment       FORCE  ROW LEVEL SECURITY;
CREATE POLICY scout_treatment_tenant ON scout_treatment
  USING (EXISTS (
    SELECT 1 FROM scout_facility f
    WHERE f.id = scout_treatment.facility_id
      AND f.organization_id = nullif(current_setting('app.current_org', true), '')::uuid))
  WITH CHECK (EXISTS (
    SELECT 1 FROM scout_facility f
    WHERE f.id = scout_treatment.facility_id
      AND f.organization_id = nullif(current_setting('app.current_org', true), '')::uuid));

ALTER TABLE scout_trap            ENABLE ROW LEVEL SECURITY;
ALTER TABLE scout_trap            FORCE  ROW LEVEL SECURITY;
CREATE POLICY scout_trap_tenant ON scout_trap
  USING (EXISTS (
    SELECT 1 FROM scout_facility f
    WHERE f.id = scout_trap.facility_id
      AND f.organization_id = nullif(current_setting('app.current_org', true), '')::uuid))
  WITH CHECK (EXISTS (
    SELECT 1 FROM scout_facility f
    WHERE f.id = scout_trap.facility_id
      AND f.organization_id = nullif(current_setting('app.current_org', true), '')::uuid));

ALTER TABLE scout_trap_reading    ENABLE ROW LEVEL SECURITY;
ALTER TABLE scout_trap_reading    FORCE  ROW LEVEL SECURITY;
CREATE POLICY scout_trap_reading_tenant ON scout_trap_reading
  USING (EXISTS (
    SELECT 1 FROM scout_trap t JOIN scout_facility f ON f.id = t.facility_id
    WHERE t.id = scout_trap_reading.trap_id
      AND f.organization_id = nullif(current_setting('app.current_org', true), '')::uuid))
  WITH CHECK (EXISTS (
    SELECT 1 FROM scout_trap t JOIN scout_facility f ON f.id = t.facility_id
    WHERE t.id = scout_trap_reading.trap_id
      AND f.organization_id = nullif(current_setting('app.current_org', true), '')::uuid));

-- ---------------------------------------------------------------------------
-- Staff / aggregate branches (design note, not drafted as policy yet):
--   Add a SECOND permissive policy per table gated on a staff GUC, e.g.
--     USING (current_setting('app.is_staff', true) = 'on' AND <pilot-tier only>)
--   matching lib/session.ts canStaffViewOrgDetail (pilot tier only, never
--   general). Aggregate/benchmark reads get their own set-based path that
--   never exposes row-level drill-down. Author and test these on the clone.
--
-- Index note: the derived (B) policies filter through scout_facility by
-- organization_id on every row — scout_facility already has
-- scout_facility_organization_id_idx, and every child already indexes its
-- parent fk, so the EXISTS lookups are index-served. Re-check EXPLAIN on the
-- clone for the hottest tables (scout_treatment, scout_observation).
-- ---------------------------------------------------------------------------
