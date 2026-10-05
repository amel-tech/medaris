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

/**
 * Where a sign-in page reached without a locale should go instead (MDRS-274),
 * or `null` when it already has one or names nothing to go by.
 *
 * `withAuth` sends a signed-out visitor to the app's `pages.signIn`, which
 * has no locale (`/auth/signin?callbackUrl=…/en/courses`). Left to next-intl,
 * that becomes the default `/tr/auth/signin`, and Keycloak opens in Turkish
 * for someone who was reading the English app. The locale of the page they
 * were stopped on is in `callbackUrl`; this moves the auth page under it.
 */
export const authPageUnderCallbackLocale = (
  { pathname, search }: { pathname: string; search: string },
  {
    authPaths,
    locales,
  }: { authPaths: readonly string[]; locales: readonly string[] }
): string | null => {
  const path = pathname.replace(/\/+$/, "") || "/";
  if (!authPaths.includes(path)) return null;
  const callbackUrl = new URLSearchParams(search).get("callbackUrl");
  if (!callbackUrl) return null;
  let target: URL;
  try {
    target = new URL(callbackUrl, "http://callback.invalid");
  } catch {
    return null;
  }
  const first = target.pathname.split("/")[1]?.toLowerCase();
  const locale = locales.find((l) => l.toLowerCase() === first);
  return locale ? `/${locale}${path}${search}` : null;
};
