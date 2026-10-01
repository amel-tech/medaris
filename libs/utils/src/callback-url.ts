/**
 * Turns the `callbackUrl` NextAuth hands an app's sign-in page into a
 * same-origin path, or `null` when it names no real destination (MDRS-101).
 *
 * NextAuth always sends one: the page the middleware stopped (`/tr/learning`),
 * or, when nothing was asked for, the app's own origin. The origin, the bare
 * locale root and anything off-origin all count as "no destination" — the
 * last one also keeps the sign-in page from becoming an open redirect.
 *
 * Here rather than in either web app because both use it and neither has a
 * test runner of its own for pure helpers like this one.
 */
export const destinationFromCallback = (
  callbackUrl: string | null | undefined,
  { baseUrl, locales }: { baseUrl: string; locales: readonly string[] }
): string | null => {
  if (!callbackUrl) return null;

  let target: URL;
  let base: URL;
  try {
    base = new URL(baseUrl);
    target = new URL(callbackUrl, base);
  } catch {
    return null;
  }
  if (target.origin !== base.origin) return null;

  const path = target.pathname.replace(/\/+$/, "") || "/";
  const localeRoot = new RegExp(`^/(${locales.join("|")})$`, "i");
  if (path === "/" || localeRoot.test(path)) return null;

  return `${path}${target.search}${target.hash}`;
};
