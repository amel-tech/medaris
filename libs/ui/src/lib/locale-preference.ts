/**
 * The viewer's language choice (MDRS-275). It is kept in this browser only,
 * in the `medaris-locale` cookie, and never on the account: the owner's
 * decision of 2026-10-05. The address carries no language (MDRS-248): each
 * app's next-intl request config reads this cookie, so the server renders the
 * chosen language from the first byte. One choice for every Medaris app: the
 * cookie is set on the parent domain, so a language picked in Tedris is the
 * one Nizam and Nazar open in.
 *
 * Nothing writes it while the apps are Turkish only (the language menu is
 * gone); an old cookie is still read, and a language an app no longer has
 * falls back to Turkish.
 */
export const LOCALE_COOKIE = "medaris-locale";

/**
 * The cookie's language in `cookieHeader` (`document.cookie` in the browser),
 * when it is one of `locales`: for code that runs outside next-intl's
 * provider, such as a root error boundary.
 */
export const readLocaleCookie = <L extends string>(
  cookieHeader: string,
  locales: readonly L[]
): L | undefined => {
  const value = cookieHeader
    .split(/;\s*/)
    .find((pair) => pair.startsWith(`${LOCALE_COOKIE}=`))
    ?.slice(LOCALE_COOKIE.length + 1);
  return locales.find((locale) => locale === value);
};

/**
 * The address without a language segment, for a link from before MDRS-248
 * (`/en/courses/1?week=2` → `/courses/1?week=2`, `/tr` → `/`), or `null` for
 * an address that has none. A bookmark, an old e-mail or a landing page
 * released before the apps still lands on its page; the language stays the
 * cookie's.
 */
export const withoutLocaleSegment = (
  { pathname, search }: { pathname: string; search: string },
  locales: readonly string[]
): string | null => {
  const segments = pathname.split("/");
  if (!locales.includes(segments[1] ?? "")) return null;
  return `/${segments.slice(2).join("/")}${search}`;
};
