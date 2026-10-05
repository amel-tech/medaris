"use client";

import { useEffect, useRef } from "react";

/** How often Ders kayıtları is read again while a Bunny upload is being prepared. */
export const PENDING_REFRESH_MS = 10_000;

/**
 * Calls `refresh` every `everyMs` while `active` holds, and stops as soon as
 * it does not: one timer, never a loop that waits on itself. A tab the reader
 * cannot see is not read again; the next tick after it shows again is. The
 * latest `refresh` is called, so a new one does not restart the timer.
 */
export function useRefreshWhile(
  active: boolean,
  refresh: () => void,
  everyMs: number = PENDING_REFRESH_MS
): void {
  const latest = useRef(refresh);
  latest.current = refresh;
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => {
      if (document.visibilityState === "hidden") return;
      latest.current();
    }, everyMs);
    return () => clearInterval(id);
  }, [active, everyMs]);
}
