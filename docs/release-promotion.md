# Scout release promotion

This document defines the engineering half of Scout release promotion. It does **not** replace the six existing Scout release gates, Airtable GO/HOLD governance, or Jan/Simon approval for wider rollout.

## Candidate identity

Every pull request into `master` runs `.github/workflows/scout-ci.yml` against the exact candidate commit. The workflow records an artifact containing:

- repository and exact Git commit SHA;
- Git ref and GitHub Actions run/attempt identifiers;
- `package-lock.json` SHA-256;
- schema/migration tree SHA-256;
- current decision/catalog-related source tree SHA-256 until CR2 introduces first-class policy/catalog version identifiers.

A reviewer must evaluate evidence from the same commit that is proposed for promotion. Evidence from an older commit is stale after any code change.

## Required engineering checks

Before ordinary merge/promotion, the intended required checks are:

1. `Scout CI / verify`
   - `npm ci` from the committed lockfile;
   - `npm run typecheck`;
   - `npm test`, including any integration suites discovered by Vitest;
   - `npm run lint` with no silent `|| true` or warning suppression in CI;
   - `npm run ci:migrations`, which fails when Drizzle generation changes committed schema/migration state;
   - `npm run build` with CI-only placeholder configuration and no production credentials.
2. `Scout CI / dependency-security`
   - complete `npm audit --json` evidence retained as an artifact;
   - critical advisories fail the check immediately;
   - known lower-severity advisories remain explicit owned work, never auto-fixed with `--force`.
3. Candidate evidence artifact exists for the exact SHA under review.

Vercel preview status may remain an additional check, but it is not the sole reproducibility gate. CI must not require production database, SMTP, Blob, OAuth, cron, VAPID, or Sentry credentials.

## Owner-approved enforcement

`master` branch protection/ruleset enforcement is a repository-owner action. Once Simon approves enforcement, configure ordinary merges so at minimum `Scout CI / verify` and `Scout CI / dependency-security` must pass on the current head SHA and require reviewed changes before merge. Do not enable an administrative bypass as the normal release path.

The current Airtable candidate GO/HOLD decision and all six existing release gates remain authoritative human governance for wider rollout. A green GitHub check is necessary engineering evidence, not an automatic GO decision.

## Production promotion

Promotion must identify the exact reviewed commit. Production credentials/data remain in the deployment platform; they are never copied into GitHub Actions simply to make CI resemble production. Preview/test resources must stay isolated from production resources.

Before wider rollout, the reviewer confirms:

- required CI checks are green for the exact candidate SHA;
- candidate evidence matches that SHA;
- applicable Scout release gates are satisfied with current evidence;
- Jan/Simon approval and Airtable GO are current rather than inherited from an older candidate;
- any schema change has a reviewed migration/rollback plan and does not require destructive production mutation during CI.

## Failure and rollback

A failed required check blocks ordinary promotion. Fix forward on a new commit and rerun all checks; do not reuse stale green evidence.

For a bad deployment, revert/promote the last reviewed known-good commit through the normal reviewed path when feasible. Database rollback is migration-specific: do not automatically reverse a migration that may have observed production writes. Prefer a reviewed forward repair unless the migration's rollback was explicitly tested and authorized.

## Emergency path

Emergency/break-glass promotion is reserved for an active production incident where waiting for the ordinary path creates greater risk. It requires explicit Simon or Jan authorization, a recorded reason and exact commit, preservation of available CI evidence, and immediate post-incident reconciliation in the authoritative Ops task. Missing or stale candidate acceptance must otherwise fail closed.
