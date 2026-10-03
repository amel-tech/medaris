import { useEffect, useRef } from "react";

/** What the hook needs from a toast store, whichever kit it belongs to. */
export interface StaleToastSource<T> {
  /** the toasts on screen right now */
  active: () => readonly T[];
  /**
   * A value that changes when the toast is re-fired or updated — the object
   * itself where the store replaces it on update (Sonner), `id:updateKey`
   * where it also replaces it for layout (Base UI).
   */
  version: (toast: T) => unknown;
  dismiss: (toast: T) => void;
}

/** The interactions that may start a navigation, captured before React sees them. */
const NAVIGATION_STARTS = ["pointerdown", "keydown", "popstate"] as const;

/**
 * Dismisses, when `routeKey` changes, every toast that was already on screen
 * when the user last did something (MDRS-214). Such a toast reports an action
 * from before the navigation, and a stale "Ders açılamadı" on the page the
 * successful retry redirected to reads as "the course was not opened".
 *
 * A toast fired after that interaction — the "Ders açıldı" a submit fires just
 * before its `router.push`, or an error that names the page it redirects to —
 * is the one the navigation was for, so it survives this change and goes on
 * the next one, or on its own timer.
 *
 * The cut-off is an interaction rather than a time window so that a slow
 * server render does not decide which toast survives.
 */
export function useDismissStaleToasts<T>(
  routeKey: string | undefined,
  source: StaleToastSource<T>
) {
  const sourceRef = useRef(source);
  sourceRef.current = source;
  const stale = useRef(new Set<unknown>());
  const previousKey = useRef(routeKey);

  useEffect(() => {
    const snapshot = () => {
      const { active, version } = sourceRef.current;
      stale.current = new Set(active().map(version));
    };
    for (const type of NAVIGATION_STARTS)
      window.addEventListener(type, snapshot, { capture: true });
    return () => {
      for (const type of NAVIGATION_STARTS)
        window.removeEventListener(type, snapshot, { capture: true });
    };
  }, []);

  useEffect(() => {
    if (previousKey.current === routeKey) return;
    previousKey.current = routeKey;
    const { active, version, dismiss } = sourceRef.current;
    for (const toast of active())
      if (stale.current.has(version(toast))) dismiss(toast);
    stale.current = new Set();
  }, [routeKey]);
}
