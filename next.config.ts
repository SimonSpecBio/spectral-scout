import type { NextConfig } from "next";

// Security audit (2026-08-27) found no headers configured at all -- no
// clickjacking protection on signed-in /app/* pages. frame-ancestors/
// X-Frame-Options is the one that actually matters here (nothing in this
// app is meant to be iframed, including the public /share/[token] page --
// it's a standalone link, not an embed feature). Deliberately NOT adding a
// full script-src/default-src CSP lockdown in this pass: that needs
// auditing every external resource this app actually loads (Google OAuth
// redirect, Vercel Blob image domain, web push) to avoid silently breaking
// one of them, which is a separate, more careful piece of work.
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
