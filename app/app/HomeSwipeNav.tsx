"use client";

import { useRouter } from "next/navigation";
import { useRef } from "react";

const SWIPE_THRESHOLD_PX = 50;

// Off-map half of the home dashboard's gesture split (ticket
// rec3FjL49m5aSyHPD, 2026-09-05): swiping anywhere on the home screen
// EXCEPT the map switches which site is shown -- the on-map counterpart
// (MapLensSwitcher) instead steps between the current site's own areas, and
// calls stopPropagation on its own touch handlers so a swipe there never
// also reaches this wrapper. Tap-pills (page.tsx's headerRow) still work
// exactly as before; this is an additional way to get the same result, not
// a replacement.
export default function HomeSwipeNav({
  facilities,
  currentFacilityId,
  children,
}: {
  facilities: { id: string }[];
  currentFacilityId: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const touchStartX = useRef<number | null>(null);

  function onTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX;
  }
  function onTouchEnd(e: React.TouchEvent) {
    if (touchStartX.current == null || facilities.length < 2) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    touchStartX.current = null;
    if (Math.abs(dx) < SWIPE_THRESHOLD_PX) return;
    const idx = facilities.findIndex((f) => f.id === currentFacilityId);
    if (idx < 0) return;
    const dir = dx < 0 ? 1 : -1;
    const next = ((idx + dir) % facilities.length + facilities.length) % facilities.length;
    router.push(`/app?facility=${facilities[next].id}`);
  }

  if (facilities.length < 2) return <>{children}</>;

  return (
    <div onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      {children}
    </div>
  );
}
