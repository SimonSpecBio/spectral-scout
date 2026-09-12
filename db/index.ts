import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as appSchema from "./schema";
import * as authSchema from "./auth-schema";
import * as idempotencySchema from "./idempotency-schema";
import * as pilotsMirror from "./pilots-mirror";

// pilots-mirror is included in the runtime query client (so app code can
// query it normally) but NOT in drizzle.config.ts's `schema` array (so
// db:generate/db:migrate never try to manage it -- see that file's header
// comment).
const schema = { ...appSchema, ...authSchema, ...idempotencySchema, ...pilotsMirror };

// pg.Pool doesn't open a real connection at construction time -- only on
// first query -- so this is safe to create eagerly even during `next
// build`'s page-data-collection pass, before DATABASE_URL is necessarily
// set. It has to be a real (not lazily-proxied) instance because
// @auth/drizzle-adapter's DrizzleAdapter() inspects `db`'s actual shape at
// import time to detect the SQL dialect; a Proxy that only forwards `get`
// doesn't survive that kind of structural check.
//
// Cached on `global` so dev-mode HMR/Turbopack module re-evaluation don't
// open a new pool on every reload.
declare global {
  var __scoutPool: Pool | undefined;
  var __scoutDb: NodePgDatabase<typeof schema> | undefined;
}

const SUPABASE_CA = `-----BEGIN CERTIFICATE-----
MIIDxDCCAqygAwIBAgIUbLxMod62P2ktCiAkxnKJwtE9VPYwDQYJKoZIhvcNAQEL
BQAwazELMAkGA1UEBhMCVVMxEDAOBgNVBAgMB0RlbHdhcmUxEzARBgNVBAcMCk5l
dyBDYXN0bGUxFTATBgNVBAoMDFN1cGFiYXNlIEluYzEeMBwGA1UEAwwVU3VwYWJh
c2UgUm9vdCAyMDIxIENBMB4XDTIxMDQyODEwNTY1M1oXDTMxMDQyNjEwNTY1M1ow
azELMAkGA1UEBhMCVVMxEDAOBgNVBAcMCk5ldyBDYXN0bGUxFTATBgNVBAoMDFN1
cGFiYXNlIEluYzEeMBwGA1UEAwwVU3VwYWJhc2UgUm9vdCAyMDIxIENBMIIBIjAN
BgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAqQXWQyHOB+qR2GJobCq/CBmQ40G0
oDmCC3mzVnn8sv4XNeWtE5XcEL0uVih7Jo4Dkx1QDmGHBH1zDfgs2qXiLb6xpw/
CKQPypZW1JssOTMIfQppNQ87K75Ya0p25Y3ePS2t2GtvHxNjUV6kjOZjEn2yWEcB
dpOVCUYBVFBNMB4YBHkNRDa/+S4uywAoaTWnCJLUi cvTlHmMw6xSQQn1UfRQHk50
DMCEJ7Cy1RxrZJrkXXRP3LqQL2ijJ6F4yMfh+Gyb4O4XajoVj/+R4GwywKYrrS8Pr
SNtwxr5StlQO8zIQUSMiq26wM8mgELFlS/32UcltNaQ1xBRizkzpZct9DwIDAQAB
o2AwXjALBgNVHQ8EBAMCAQYwHQYDVR0OBBYEFKjXuXY32CztkhImng4yJNUtaUYs
MB8GA1UdIwQYMBaAFKjXuXY32CztkhImng4yJNUtaUYsMA8GA1UdEwEB/wQFMAMB
Af8wDQYJKoZIhvcNAQELBQADggEBAB8spzNn+4VUtVxbdMaX+39Z50sc7uATmus1
6jmmHjhIHz+l/9GlJ5KqAMOx26mPZgfzG7oneL2bVW+WgYUkTT3XEPFWnTp2RJwQ
ao8/tYPXWEJDc0WVQHrpmnWOFKU/d3MqBgBm5y+6jB81TU/RG2rVerPDWP+1MMcN
Ny0491CTL5XQZ7JfDJJ9CCmXSdtTl4uUQnSuv/QxCea13BX2ZgJc7Au30vihLhub
52De4P/4gonKsNHYdbWjg7OWKwNv/zitGDVDB9Y2CMTyZKG3XEu5Ghl1LEnI3QmE
KsqaCLv12BnVjbkSeZsMnevJPs1Ye6TjjJwdik5Po/bKiIz+Fq8=
-----END CERTIFICATE-----`;

const pool = (global.__scoutPool ??= new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes("localhost") ? false : { ca: SUPABASE_CA },
}));

export const db: NodePgDatabase<typeof schema> = (global.__scoutDb ??= drizzle(pool, { schema }));
