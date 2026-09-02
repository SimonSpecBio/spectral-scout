"use client";

import { useEffect, useState } from "react";

// Root cause of the long-standing hydration-mismatch bug (React error
// #418) on the dashboard and pest-event detail page, confirmed by direct
// test: the error reproduces on the deployed site but vanishes when the
// browser's timezone is forced to UTC (matching Vercel's server). A
// Client Component still gets server-rendered once (using the SERVER's
// timezone) before hydrating in the browser (the VISITOR's timezone) --
// toLocaleDateString/toLocaleString/toLocaleTimeString compute using
// whichever timezone the code happens to run in, so calling one directly
// in a render body produces different text on the two passes whenever a
// timestamp's calendar date/hour differs between UTC and the visitor's
// real zone (common: an early-UTC-morning timestamp lands on the
// previous calendar day in every zone west of UTC).
//
// Rendering nothing until mount keeps the FIRST client render identical
// to the server's (both empty) -- hydration only compares that first
// pass, so filling in the real value in a later commit is safe and shows
// the visitor's correct local time, never a UTC substitute.
export default function LocalDate({ date, format }: { date: string | Date; format: (d: Date) => string }) {
  const [mounted, setMounted] = useState(false);
  // The whole point of this effect is "flip to true once mounted on the
  // client" -- there's no external system to subscribe to instead, and no
  // dependency that would make this loop.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return <>{format(typeof date === "string" ? new Date(date) : date)}</>;
}
