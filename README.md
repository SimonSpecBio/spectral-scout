# Spectral Scout

Free pest scouting and crop protection management for greenhouse/indoor
growers, and Spectral BioControl's long-term operational data platform.
Full product brief discussed before scaffolding; this README covers the
engineering setup.

## What's scaffolded so far

- **Auth**: Google OAuth for internal staff (`ALLOWED_STAFF_EMAILS`
  allowlist), email magic-link for growers (self-serve, arbitrary email
  domains). Unlike the other three Spectral apps, growers aren't
  staff-provisioned in advance -- signing in with a new email auto-creates
  an organization + owner membership on the fly (`auth.ts`'s `session`
  callback).
- **Data model** (`db/schema.ts`): organizations (with an `accountTier`
  of `general` | `pilot` -- the hard privacy boundary, see below),
  facilities, facility areas (with `backgroundImageUrl`/`backgroundScale`
  for tracing over an uploaded blueprint or satellite image instead of
  drawing from scratch), a generic facility-map-object table (shape +
  geometry + style + freeform metadata, not one table per object type),
  pest events (the central object -- a dropped pin on the map, not a hard
  FK to one drawn object), scouting observations (ported field-shape from
  spectral-pilot's `pp_reports`), and treatments (pesticide/biological/
  Spectral-light share one model).
- **Staff/general-tier privacy boundary**: `lib/session.ts`'s
  `canStaffViewOrgDetail()` is the one gate every staff-facing route must
  check before returning org-identifiable data. Pilot-program orgs (real
  contractual relationship, same as spectral-pilot's staff view today) get
  full drill-down. Free-tier orgs never do -- staff only ever see
  aggregated/anonymized stats for those, by construction, not by UI
  convention. See `app/staff/page.tsx` for the pattern in practice.
- **Shared Postgres instance**: same physical database as spectral-ops/
  spectral-pilot/spectral-rnd, `scout_`-prefixed tables, its own migrations
  tracking table (`__scout_drizzle_migrations`) -- see
  `drizzle.config.ts`. `db/pilots-mirror.ts` is a read-only mirror of
  spectral-ops's `pilots` table, same trick spectral-pilot already uses, to
  resolve pilot-tier orgs' program details by `pilotKey`.

## Not built yet

Facility map editor UI (Konva canvas, background-image tracing), pest
event creation flow, scouting submission form, treatment records,
analytics, and the staff promote-to-detail pages beyond the placeholder
org list. Schema and plumbing (auth, org auto-provisioning, tier
enforcement) come first on purpose -- everything else builds on top of it.

## One-time setup

**1. `DATABASE_URL`** -- reuse the same connection string as
spectral-ops/spectral-pilot/spectral-rnd's `.env.local` (same shared
instance, see above). No new database needed.

**2. Run the migration:**

```bash
npm install
npm run db:generate   # first time only, writes drizzle/0000_*.sql
npm run db:migrate
```

**3. Staff sign-in (Google OAuth).** This app needs its **own** OAuth
client in Google Cloud Console (distinct client ID/secret from the other
three apps -- matched by redirect URI, not shared):

```
console.cloud.google.com -> APIs & Services -> Credentials ->
Create Credentials -> OAuth client ID -> Web application ->
authorized redirect URI: <your-deployment-url>/api/auth/callback/google
(and http://localhost:3000/api/auth/callback/google for local dev)
```

**4. Grower sign-in (email magic-link).** Needs a verified Resend sending
domain, not sandbox mode -- sandbox only delivers to the account owner's
own address, which breaks sign-in for every real grower. See
spectral-pilot's README for the exact domain-verification steps (same
fix applies here).

**5. Copy `.env.example` to `.env.local`** and fill in the values above,
plus `AUTH_SECRET`, `ALLOWED_STAFF_EMAILS`, and `BLOB_READ_WRITE_TOKEN`
(Vercel dashboard -> Storage -> Blob -> Create, for facility map
background images and scouting/pest-event photos).

## Running it

```bash
npm run dev
```

`/` is public (landing + sign-in -- this is the one app of the four that's
meant to be signed-out-visitable, since it's a self-serve free tool).
`/app/*` is the grower app, `/staff/*` is internal.
