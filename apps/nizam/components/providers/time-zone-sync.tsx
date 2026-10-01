"use client";

import { useEffect } from "react";
import { syncViewerTimeZone } from "~/lib/viewer-time-zone";

/** Marks a tab that has already told the server its zone. */
const SYNCED_KEY = "medaris-tz-synced";

/**
 * Once per browser tab, tells the server which zone this viewer is in
 * (MDRS-110). Until the cookie exists — a first visit — the server and the
 * browser both render in the default zone, so hydration always agrees. When
 * the action changes the cookie, Next re-renders the current route in the
 * action's own response, so no extra `router.refresh()` is needed.
 */
export function TimeZoneSync() {
  useEffect(() => {
    try {
      if (sessionStorage.getItem(SYNCED_KEY)) return;
      sessionStorage.setItem(SYNCED_KEY, "1");
    } catch {
      // No sessionStorage (private mode, blocked storage): sync every load.
    }
    const browserTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    // A failed sync leaves the page in the zone it was rendered in.
    syncViewerTimeZone(browserTimeZone).catch(() => undefined);
  }, []);

  return null;
}
