import { themeScript } from "../lib/theme";

/**
 * The no-flash theme script, for the `<head>` of every app's root `<html>`
 * (which also carries `data-theme="light"` and `suppressHydrationWarning`).
 * It is inline so the attribute is set before first paint; the web apps send
 * no Content-Security-Policy, so nothing needs a nonce or a hash.
 */
export function ThemeScript() {
  // `themeScript` is a constant of this package; no input reaches it.
  return <script dangerouslySetInnerHTML={{ __html: themeScript }} />;
}
