-- =============================================================================
-- Read-only privilege & RLS verification for Task 069.
-- Safe to run against any environment: SELECT-only, no writes, no DDL.
-- Run on the ISOLATED CLONE (and, if authorized, read-only against prod once)
-- to capture the actual starting state before Phase 1, and to confirm each
-- phase landed as intended. Do NOT paste output containing connection strings
-- or secrets into Airtable or anywhere shared.
-- =============================================================================

-- 1. Which roles exist and which bypass RLS. Expect today: the app's login
--    role has rolbypassrls = true (the gap this ticket addresses). Target:
--    a scout_app role with rolbypassrls = false.
SELECT rolname, rolsuper, rolbypassrls, rolcanlogin
FROM pg_roles
WHERE rolname NOT LIKE 'pg\_%'
ORDER BY rolname;

-- 2. Per-table RLS flags for scout_* tables.
--    relrowsecurity  = RLS enabled;  relforcerowsecurity = enforced even for
--    the table owner. Expect today: relrowsecurity = true everywhere,
--    relforcerowsecurity = false, and (from #3) no policies -> decoration only.
SELECT c.relname AS table_name,
       c.relrowsecurity      AS rls_enabled,
       c.relforcerowsecurity AS rls_forced
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND c.relname LIKE 'scout\_%'
ORDER BY c.relname;

-- 3. Actual policies defined on scout_* tables. Expect today: ZERO rows.
SELECT schemaname, tablename, policyname, cmd, roles, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename LIKE 'scout\_%'
ORDER BY tablename, policyname;

-- 4. Table-level grants on scout_* (who can do what). Use to confirm, after
--    Phase 1, that scout_app has only the DML it needs and scout_migrator owns
--    DDL. Expect today: broad grants to the single shared role.
SELECT table_name, grantee, string_agg(privilege_type, ', ' ORDER BY privilege_type) AS privileges
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND table_name LIKE 'scout\_%'
GROUP BY table_name, grantee
ORDER BY table_name, grantee;

-- 5. Cross-app coupling check: what does Scout's pilots-mirror resolve to, and
--    can the (future) scout_app role read it? Adjust the object name to match
--    db/pilots-mirror.ts. Confirms the one real cross-app read path survives
--    least-privilege lockdown.
SELECT c.relname, c.relkind
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND (c.relname LIKE 'pp\_%' OR c.relname ILIKE '%pilot%')
ORDER BY c.relname;

-- 6. Sanity: confirm the transaction-local GUC pattern the runtime will use
--    behaves as fail-closed. Run inside a transaction as scout_app once it
--    exists:
--      BEGIN;
--      SELECT current_setting('app.current_org', true);          -- NULL (unset)
--      SELECT set_config('app.current_org', gen_random_uuid()::text, true);
--      SELECT current_setting('app.current_org', true);          -- the uuid
--      COMMIT;
--      SELECT current_setting('app.current_org', true);          -- NULL again
