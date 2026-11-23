"use client";

import { useLayoutEffect, useSyncExternalStore } from "react";
import { THEME_STORAGE_KEY, themeFromStored, themeScript } from "../lib/theme";

const subscribe = () => () => {};

/**
 * The no-flash theme script, for the `<head>` of every app's root `<html>`
 * (which also carries `data-theme="light"` and `suppressHydrationWarning`).
 * It is inline so the attribute is set before first paint; the web apps send
 * no Content-Security-Policy, so nothing needs a nonce or a hash.
 *
 * The `<script>` is only drawn into HTML that comes from the server, and
 * hydration keeps it. When the browser draws the root itself (`global-error`,
 * or the root layout again after its "Yeniden dene"), a script React creates
 * would never run, and React says so in the console ("Encountered a script
 * tag while rendering React component"); there the layout effect sets the
 * attribute instead, after React has written `data-theme="light"` back on
 * `<html>` and before the paint.
 */
export function ThemeScript() {
  const fromServer = useSyncExternalStore(
    subscribe,
    () => false,
    () => true
  );

  useLayoutEffect(() => {
    let stored: string | null = null;
    try {
      stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    } catch {
      // storage blocked: the page stays light, as the script leaves it
    }
    document.documentElement.dataset.theme = themeFromStored(stored);
  }, []);

  // `themeScript` is a constant of this package; no input reaches it.
  return fromServer ? (
    <script dangerouslySetInnerHTML={{ __html: themeScript }} />
  ) : null;
}
