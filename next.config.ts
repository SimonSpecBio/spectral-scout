import type { NextConfig } from "next";

// Security audit (2026-08-27) found no headers configured at all -- no
// clickjacking protection on signed-in /app/* pages. frame-ancestors/
// X-Frame-Options is the one that actually matters here (nothing in this
// app is meant to be iframed, including the public /share/[token] page --
// it's a standalone link, not an embed feature).
//
// A real script/style/img/connect-src CSP (follow-up ticket) now exists
// too, but only for /app/* and /staff/* -- proxy.ts sets a per-request
// nonce'd version there, since that's where a real session and real
// actions live. It's set in the middleware, not here, because script-src
// needs a fresh nonce every request (this config's headers() is static).
// Public pages (/, /share/[token], /api/auth/*) keep this frame-ancestors-
// only baseline unchanged -- extending the nonce mechanism to them means
// widening proxy.ts's matcher, a separate, more careful piece of work than
// this pass (getting it wrong risks silently breaking sign-in itself).
const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
