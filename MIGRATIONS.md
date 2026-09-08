# Migration safety procedure

Phase 0.9 (build-cycle doc, 2026-09-07). This instance is a **shared Postgres
database** — spectral-ops, spectral-pilot, and spectral-rnd all connect to
the same instance Scout does. A bad migration here is not a Scout-only
incident; it can take down or corrupt data for all four apps. This is a
one-page procedure, not a framework — read it before running `db:migrate`
against production for anything beyond a routine, already-reviewed column
add.

## What already protects us

- **Table prefix**: every Scout table is named `scout_*`. A migration that
  only touches `scout_*` tables cannot collide with another app's tables.
- **Dedicated migrations table**: Scout tracks its own applied-migrations
  history in `__scout_drizzle_migrations` (see `drizzle.config.ts`), not
  drizzle's default shared table — so Scout's migration history can't be
  confused with another app's.
- **RLS is enabled** on the instance, but **no policies are defined** — this
  is not a real access-control backstop today. Do not assume RLS will save
  you if a migration accidentally widens a grant or drops a constraint.
  Treat every migration as if RLS provides zero protection, because
  functionally it doesn't yet.

None of this protects against: dropping/renaming a column another app reads
directly (if one exists), a migration that takes an exclusive lock on a
large shared table for longer than a normal deploy window, or exhausting
the shared connection pool.

## Before a migration reaches production

"Tested" means all of the following happened, not just that `db:generate`
ran without error:

1. **Read the generated SQL file in `drizzle/`, don't just trust the
   migration name.** Drizzle-kit's interactive rename-detection prompt has
   produced wrong SQL before in this project's history when answered on
   autopilot — a rename it guessed wrong becomes a silent drop + a silent
   create.
2. **Confirm the migration only touches `scout_*` tables** (or explicitly
   intends a cross-app change, which needs sign-off per "Who to tell"
   below before it runs).
3. **Run `npm run build` (typecheck) and exercise the affected feature
   locally against the real dev database** before applying to production —
   this repo's own standing rule (see `CLAUDE.md`/session practice): "fixed"
   means a named test or a live-clicked path, never just a clean build.
4. For anything beyond a straightforward additive column/table: **take a
   manual note of the exact SQL you're about to run** (copy it out of the
   `drizzle/NNNN_*.sql` file) so step "back one out" below doesn't require
   reverse-engineering it under pressure.

## Identifying the last-good migration

- `drizzle/` is numbered sequentially (`0001_...` through the current max).
  `drizzle/meta/_journal.json` lists every migration drizzle-kit has
  generated, in order, with its own idempotency tag.
- The database's own applied-migrations record is
  `select * from __scout_drizzle_migrations order by created_at desc;` —
  this tells you exactly which migrations this specific database instance
  has actually run, which can lag behind what's in `drizzle/` on disk if a
  deploy failed partway.
- Cross-reference against `git log -- drizzle/` to find which commit (and
  therefore which deploy) introduced the migration in question.

## Backing one out

Drizzle does not generate down-migrations automatically. There is no
`db:migrate:down` in this project. Two paths, in order of preference:

1. **Forward-fix, don't reverse.** If the bad migration only added
   something (a column, a table, an index), the fastest safe fix is
   usually a new forward migration that corrects it, not an attempt to
   surgically undo the last one — Postgres has almost certainly already
   accepted writes against the new shape by the time anyone notices.
2. **Manual rollback SQL, run by hand, reviewed before executing.** If the
   migration must be reversed (a bad constraint blocking all writes, a
   destructive change that has to stop immediately): write the inverse SQL
   yourself from the forward migration file, run it directly against the
   database (not through drizzle-kit), and manually delete the
   corresponding row from `__scout_drizzle_migrations` so drizzle's own
   state matches reality. **Never drop a column or table without first
   confirming grep across spectral-ops/spectral-pilot/spectral-rnd finds no
   reference to it** — this instance is shared, and a name that looks
   Scout-only might not be.

Either way: the data written under the bad schema between deploy and
rollback needs a manual decision (keep, migrate forward, or discard) — a
rollback is not automatically data-safe just because the schema reverted.

## Who to tell

**simon@spectralbiocontrol.com** — immediately, before attempting a
rollback if there's any doubt about whether it's safe. Since this is a
shared instance, also flag it wherever spectral-ops/spectral-pilot/
spectral-rnd's own on-call/notification path lives, if one exists and
you're not already the same person monitoring all four.
