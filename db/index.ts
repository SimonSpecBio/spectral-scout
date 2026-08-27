import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as appSchema from "./schema";
import * as authSchema from "./auth-schema";
import * as pilotsMirror from "./pilots-mirror";

// pilots-mirror is included in the runtime query client (so app code can
// query it normally) but NOT in drizzle.config.ts's `schema` array (so
// db:generate/db:migrate never try to manage it -- see that file's header
// comment).
const schema = { ...appSchema, ...authSchema, ...pilotsMirror };

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

// rejectUnauthorized: false previously disabled TLS certificate validation
// entirely (MITM risk on the DB connection). Supabase's pooler presents its
// own private CA chain (Supabase Root/Intermediate 2021 CA), not a
// publicly-trusted one, so plain `ssl: true` fails with "self-signed
// certificate in certificate chain" -- pinning the real root cert (captured
// directly from this project's own DATABASE_URL host via `openssl s_client`,
// valid until 2031) is what actually restores real certificate validation
// instead of disabling it a different way. Inlined as a string rather than
// read from a sibling .pem file -- Turbopack's bundled runtime rewrites
// `__dirname` to a synthetic path with no real file behind it, so
// fs.readFileSync(path.join(__dirname, ...)) 500s in practice even though
// it works fine under plain Node/tsx; a public CA cert isn't sensitive, so
// inlining it here has no downside.
const SUPABASE_CA = `-----BEGIN CERTIFICATE-----
MIIDxDCCAqygAwIBAgIUbLxMod62P2ktCiAkxnKJwtE9VPYwDQYJKoZIhvcNAQEL
BQAwazELMAkGA1UEBhMCVVMxEDAOBgNVBAgMB0RlbHdhcmUxEzARBgNVBAcMCk5l
dyBDYXN0bGUxFTATBgNVBAoMDFN1cGFiYXNlIEluYzEeMBwGA1UEAwwVU3VwYWJh
c2UgUm9vdCAyMDIxIENBMB4XDTIxMDQyODEwNTY1M1oXDTMxMDQyNjEwNTY1M1ow
azELMAkGA1UEBhMCVVMxEDAOBgNVBAgMB0RlbHdhcmUxEzARBgNVBAcMCk5ldyBD
YXN0bGUxFTATBgNVBAoMDFN1cGFiYXNlIEluYzEeMBwGA1UEAwwVU3VwYWJhc2Ug
Um9vdCAyMDIxIENBMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAqQXW
QyHOB+qR2GJobCq/CBmQ40G0oDmCC3mzVnn8sv4XNeWtE5XcEL0uVih7Jo4Dkx1Q
DmGHBH1zDfgs2qXiLb6xpw/CKQPypZW1JssOTMIfQppNQ87K75Ya0p25Y3ePS2t2
GtvHxNjUV6kjOZjEn2yWEcBdpOVCUYBVFBNMB4YBHkNRDa/+S4uywAoaTWnCJLUi
cvTlHmMw6xSQQn1UfRQHk50DMCEJ7Cy1RxrZJrkXXRP3LqQL2ijJ6F4yMfh+Gyb4
O4XajoVj/+R4GwywKYrrS8PrSNtwxr5StlQO8zIQUSMiq26wM8mgELFlS/32Uclt
NaQ1xBRizkzpZct9DwIDAQABo2AwXjALBgNVHQ8EBAMCAQYwHQYDVR0OBBYEFKjX
uXY32CztkhImng4yJNUtaUYsMB8GA1UdIwQYMBaAFKjXuXY32CztkhImng4yJNUt
aUYsMA8GA1UdEwEB/wQFMAMBAf8wDQYJKoZIhvcNAQELBQADggEBAB8spzNn+4VU
tVxbdMaX+39Z50sc7uATmus16jmmHjhIHz+l/9GlJ5KqAMOx26mPZgfzG7oneL2b
VW+WgYUkTT3XEPFWnTp2RJwQao8/tYPXWEJDc0WVQHrpmnWOFKU/d3MqBgBm5y+6
jB81TU/RG2rVerPDWP+1MMcNNy0491CTL5XQZ7JfDJJ9CCmXSdtTl4uUQnSuv/Qx
Cea13BX2ZgJc7Au30vihLhub52De4P/4gonKsNHYdbWjg7OWKwNv/zitGDVDB9Y2
CMTyZKG3XEu5Ghl1LEnI3QmEKsqaCLv12BnVjbkSeZsMnevJPs1Ye6TjjJwdik5P
o/bKiIz+Fq8=
-----END CERTIFICATE-----`;

const pool = (global.__scoutPool ??= new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes("localhost") ? false : { ca: SUPABASE_CA },
}));

export const db: NodePgDatabase<typeof schema> = (global.__scoutDb ??= drizzle(pool, { schema }));
