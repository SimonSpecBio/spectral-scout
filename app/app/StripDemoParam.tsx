"use client";

import { useEffect } from "react";
import { DEMO_QUERY_PARAM } from "@/lib/demo-account";

// Removes ?demo=<token> from the visible URL once proxy.ts has already
// turned it into a real session cookie (ticket recFlz4adX8fhWS61) -- the
// token itself is still valid until it expires (a stateless client that
// never keeps cookies still needs to keep sending it), but there's no
// reason to leave it sitting in the address bar, browser history, or
// anything that screenshots/shares the URL once this browser has its own
// cookie doing the real work. A no-op for every normal page load (no
// param to strip), and pure client-side history editing -- no navigation,
// no re-render, nothing for the server to know about.
export default function StripDemoParam() {
  useEffect(() => {
    const url = new URL(window.location.href);
    if (!url.searchParams.has(DEMO_QUERY_PARAM)) return;
    url.searchParams.delete(DEMO_QUERY_PARAM);
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  }, []);

  return null;
}
