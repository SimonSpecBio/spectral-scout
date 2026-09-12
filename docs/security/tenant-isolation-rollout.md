# Least-privilege runtime & tenant-isolation rollout design

Task 069 (CR1). Author: Claude (Opus 4.8, SWE agent), 2026-09-12.

**Status of this document: DESIGN + DRAFT artifacts only. No live privilege
change is authorized or performed by this work.** Every phase that alters a
database role, policy, or the production connection string requires Simon's
explicit approval and must first be exercised on an isolated clone (see
[Blocking prerequisites](#blocking-prerequisites)).

---

## 1. Problem & current state

Tenant isolation in Scout is enforced **entirely at the application layer**:
every API route filters by `organizationId` (grower data) or gates on
`scout_staff` / account tier (staff surfaces). There is **no database-level
backstop**. If one route ever forgets its `organizationId` predicate, one
org can read or write another org's data and nothing below the app stops it.

Verified facts (carry forward from the 2026-08-28 review on this ticket;
re-verify with [`verify-privileges.sql`](./verify-privileges.sql) against the
clone before acting):

- Every `scout_*` table calls `.enableRLS()` in `db/schema.ts`, so
  `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` is present in the migrations.
- **Zero RLS policies exist.** RLS-enabled + no policy would deny all access
  to a non-owner role, but...
- The app's connection role (`postgres`) has **`rolbypassrls = true`**, so RLS
  is bypassed for every query. RLS today is decoration.
- All four apps — Scout, Ops, Pilot, R&D — connect to the **same** Supabase
  Postgres via `pg.Pool` on the same `DATABASE_URL`
  (`db/index.ts` in each repo), i.e. the same superuser-ish role.

### Table ownership (why a Scout-scoped rollout is safe for the others)

Each app owns a table-name prefix in the shared database:

| App | Prefix(es) | Reads across apps? |
|-----|-----------|--------------------|
| Scout | `scout_*` | Reads pilot data via `db/pilots-mirror.ts` |
| Ops | `ledger_*`, `metric_*`, `sync_*` | — |
| Pilot | `pp_*` (+ pilots mirror) | — |
| R&D | `rnd_*` | — |

No app except Scout queries `scout_*`. Therefore enabling **policies +
`FORCE ROW LEVEL SECURITY` on `scout_*` only** cannot change what Ops/Pilot/R&D
see — as long as they keep running under a role that is unaffected. The one
real cross-app coupling is Scout's **`pilots-mirror`** read path: the Scout
runtime role must retain `SELECT` on whatever object that mirror resolves to,
or Scout breaks. This is the single most likely thing a naive lockdown gets
wrong.

---

## 2. Threat / role matrix

Roles are the target end-state, not today's reality (today everything is one
BYPASSRLS role).

| Principal | Role | Reaches | Tenant scope | RLS |
|-----------|------|---------|--------------|-----|
| Migrations / `drizzle-kit` | `scout_migrator` (owner of `scout_*`, DDL) | `scout_*` DDL+DML | none (admin) | BYPASSRLS (owner) |
| Scout web runtime | `scout_app` (DML only, **no** BYPASSRLS) | `scout_*` + `SELECT` on pilot mirror | transaction-local `app.current_org` | **enforced** |
| Staff surfaces | `scout_app` + a staff context flag | `scout_*` for pilot orgs only | `app.is_staff = on` policy branch | enforced (staff policy) |
| Cross-org aggregate/benchmark | `scout_app` with an explicit `app.aggregate = on` read path | aggregate-only columns | policy allows set-based read, never row drill-down | enforced |
| Ops / Pilot / R&D runtimes | unchanged this ticket | their own prefixes | app-layer (unchanged) | unchanged |

Threats addressed:

- **T1 — missing `organizationId` predicate in a route:** DB policy denies
  rows outside `app.current_org`. Defense in depth for the exact class of bug
  the app layer can regress into.
- **T2 — cross-tenant write** (crafted foreign id): `WITH CHECK` on
  INSERT/UPDATE rejects rows whose `organization_id` ≠ `app.current_org`.
- **T3 — connection reuse leaking tenant context under pooling:** see §3.
- **T4 — staff over-reach** into `general`-tier orgs: staff policy branch is
  scoped to pilot-tier orgs, matching `canStaffViewOrgDetail`.

Explicitly **out of scope / do-not-do**:

- Never `ALTER ROLE postgres NOBYPASSRLS` (or revoke BYPASSRLS from the shared
  role) as a quick fix — it would silently break app-layer-only tenancy in
  **all four** apps at once. New least-privilege roles are introduced
  *alongside* the existing one; the shared role is retired only after every app
  has migrated its `DATABASE_URL` and passed compatibility checks.

---

## 3. Tenant context under connection pooling

The runtime pool sits behind Supabase's pooler. The tenant id must be set so
it **cannot** survive into the next request that reuses the physical
connection:

- Set it **transaction-locally** with `select set_config('app.current_org', $1, true)`
  (the `true` = `is_local`) as the first statement of a transaction, and run
  every tenant query inside that same transaction. `SET LOCAL` is reverted at
  COMMIT/ROLLBACK, so a pooled connection handed to another request starts with
  no org context — and the policy expression
  `nullif(current_setting('app.current_org', true), '')::uuid`
  yields NULL when the setting is absent, so no row matches: it fails **closed**.
- **Use `nullif(..., '')`, not a bare cast** (verified on pglite, 2026-09-12):
  a truly-unset GUC read with `missing_ok=true` is NULL, but an *empty-string*
  value (`''::uuid`) raises `invalid input syntax for type uuid` — the query
  errors instead of returning zero rows. Wrapping in `nullif(x, '')` collapses
  both the unset and empty cases to NULL → clean, uniform fail-closed. The draft
  policies use this form throughout.
- **Never** use session-level `SET` (no `is_local`): under transaction-mode
  pooling it leaks to whichever request next borrows the connection — the exact
  T3 cross-tenant bug.
- Drizzle: wrap tenant work in `db.transaction(async (tx) => { await tx.execute(sql`select set_config('app.current_org', ${orgId}, true)`); ... })`.
  This is the one production-code change the runtime needs; it is additive
  (queries still carry their `organizationId` predicate, so behavior is
  identical while BYPASSRLS is still in effect and only *starts* being enforced
  once policies + the non-bypass role go live).

Confirm the pooler mode before rollout: transaction-mode pooling forbids
session `SET` and prepared-statement assumptions; `set_config(..., true)` is
safe in both session and transaction modes.

---

## 4. Phased rollout

Each phase is independently reversible and gated on the prior phase passing on
the clone.

**Phase 0 — Verify (read-only, safe now).** Run `verify-privileges.sql` on a
clone; record actual roles, `rolbypassrls`, `pg_policies`, per-table
`relrowsecurity`/`relforcerowsecurity`. Snapshot for rollback.

**Phase 1 — Introduce roles (no behavior change).** Create `scout_migrator`
(owns `scout_*`) and `scout_app` (DML on `scout_*`, `SELECT` on the pilot
mirror, **no** BYPASSRLS). Grant, but do **not** yet repoint any app. The
existing `postgres` role keeps working. Reversible: `DROP ROLE`.

**Phase 2 — Add tenant context in code (no enforcement yet).** Ship the
`set_config('app.current_org', …, true)` transaction wrapper in Scout. With
BYPASSRLS still in effect and policies absent, this is a no-op at runtime but
proves the wrapper works end-to-end. Covered by tests before merge.

**Phase 3 — Author policies (still not enforced).** Add per-table policies
(see [`scout-rls-policies.draft.sql`](./scout-rls-policies.draft.sql)) and
`ENABLE`/`FORCE` RLS. Because `scout_app` isn't live yet and `postgres`
bypasses, still no runtime change. Validate policies on the clone by connecting
*as* `scout_app` and asserting the §6 test matrix.

**Phase 4 — Cut Scout runtime to `scout_app`.** Change **only Scout's**
`DATABASE_URL` to the `scout_app` role. RLS now actually enforces for Scout.
Ops/Pilot/R&D untouched. Rollback = revert the connection string.

**Phase 5 — Retire shared bypass (separate approval).** Only after Ops/Pilot/
R&D have their own least-privilege roles and pass compatibility checks, remove
BYPASSRLS from the shared role. Not part of Scout's CR1; tracked as a
cross-app follow-up.

---

## 5. Rollback

- Phases 1–3 are additive; rollback is `DROP`/revert with zero runtime effect.
- Phase 4 rollback: repoint Scout `DATABASE_URL` back to the current role;
  enforcement stops immediately, app-layer scoping still protects as it does
  today. Keep the previous connection string in the secret store for one
  release cycle.
- Keep `FORCE ROW LEVEL SECURITY` off until Phase 4 so the owner/migrator path
  is never accidentally filtered during DDL/backfills.

---

## 6. Verification / test matrix (must pass on the clone before Phase 4)

Run **as `scout_app`** with `app.current_org` set per case:

1. Two orgs, same table: org A cannot SELECT org B's rows (events, treatments,
   inventory, tasks, traps, facilities, observations). Extends the app-level
   proof already shipped in `test/db/cross-org-isolation.db.test.ts` (Task 704)
   down to the DB layer.
2. INSERT/UPDATE with `organization_id` ≠ `app.current_org` is rejected by
   `WITH CHECK` (T2).
3. No `app.current_org` set → zero rows / denied writes (fail-closed, T3).
4. Simulated pooled reuse: run tenant A in one transaction, then tenant B on
   the same connection; B never sees A's context.
5. Staff path: staff flag reads pilot-tier orgs only; `general`-tier drill-down
   denied (matches `canStaffViewOrgDetail`).
6. `pilots-mirror` read still succeeds under `scout_app` (cross-app regression).
7. Ops/Pilot/R&D smoke tests still pass unchanged (they never touch `scout_*`).

A `scout_app`-connected variant of the Task 704 pglite harness can drive
1–4 and 6 automatically once the role exists.

## Blocking prerequisites

Live implementation (Phases 4–5, and validating 1–3 as `scout_app`) needs two
things this agent cannot provide autonomously:

1. **An isolated clone** of the shared Supabase database (or a disposable
   Postgres seeded from the four apps' migrations) — production must not be the
   test bed, and no customer data may be copied without authorization.
2. **Simon's approval** for any role/privilege/connection-string change, given
   the four-app blast radius.

These are captured as a human task linked to 069's `Blocked by`. Until they are
satisfied, only Phases 0–3 authoring (design, draft policies, verification
script, code wrapper) can proceed, and none of it is applied to production.
