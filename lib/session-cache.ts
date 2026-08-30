import crypto from "crypto";

// proxy.ts's auth() call already runs the full session() callback (staff
// check -> membership check -> organization lookup, 3 sequential DB round
// trips on top of the adapter's own session/user lookup). Every server
// component/route handler then called requireGrowerSession() etc. and ran
// that ENTIRE chain again from scratch, since middleware and the page
// render are separate execution passes with no shared request cache --
// doubling real cross-region (iad1 compute / us-west-2 DB) latency on
// every single navigation. This carries middleware's already-resolved
// session forward via a request header instead.
//
// Signed (HMAC, AUTH_SECRET) rather than trusted as-is: proxy.ts's matcher
// doesn't cover every route, and an unsigned header would let a request to
// an uncovered route smuggle in an arbitrary "session" the app would
// blindly trust. Verifying the signature means a forged header just fails
// to decode and falls back to the real auth() call -- same as if the
// header were never sent.
const HEADER_NAME = "x-scout-session";

function sign(payload: string): string {
  return crypto.createHmac("sha256", process.env.AUTH_SECRET!).update(payload).digest("hex");
}

export function encodeSessionHeader(session: unknown): string {
  const payload = Buffer.from(JSON.stringify(session)).toString("base64");
  return `${payload}.${sign(payload)}`;
}

export function decodeSessionHeader(value: string | null): unknown | null {
  if (!value) return null;
  const dot = value.lastIndexOf(".");
  if (dot === -1) return null;
  const payload = value.slice(0, dot);
  const sig = value.slice(dot + 1);
  const expected = sign(payload);
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    return JSON.parse(Buffer.from(payload, "base64").toString("utf8"));
  } catch {
    return null;
  }
}

export const SESSION_HEADER_NAME = HEADER_NAME;
