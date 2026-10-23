/**
 * The viewer's language choice (MDRS-275). It is kept in this browser only,
 * in the `medaris-locale` cookie, and never on the account: the owner's
 * decision of 2026-10-05. The address carries no language (MDRS-248): each
 * app's next-intl request config reads this cookie, so the server renders the
 * chosen language from the first byte. One choice for every Medaris app: the
 * cookie is set on the parent domain, so a language picked in Tedris is the
 * one Nizam and Nazar open in.
 */
export const LOCALE_COOKIE = "medaris-locale";
const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/** Each language in its own name: the same in every interface language. */
export const LOCALE_NAMES: Record<string, string> = {
  tr: "Türkçe",
  en: "English",
  ar: "العربية",
};

/**
 * The domain the cookie is shared on: the app's host without its first label
 * (`nizam-dev.medaris.app` → `medaris.app`), so every sibling app reads it.
 * `undefined`, a host-only cookie, for `localhost`, an IP address or a host of
 * two labels, where there is no parent to share (on localhost the apps share
 * cookies across ports anyway).
 */
export const localeCookieDomain = (hostname: string): string | undefined => {
  if (hostname === "localhost" || /^[\d.]+$/.test(hostname)) return undefined;
  if (hostname.includes(":")) return undefined; // IPv6
  const labels = hostname.split(".");
  return labels.length > 2 ? labels.slice(1).join(".") : undefined;
};

/** A year long, every app of the domain, `Secure` wherever the page is. */
export const storeLocale = (locale: string) => {
  const { protocol, hostname } = window.location;
  const secure = protocol === "https:" ? "; Secure" : "";
  const domain = localeCookieDomain(hostname);
  const scope = domain ? `; Domain=${domain}` : "";
  // biome-ignore lint/suspicious/noDocumentCookie: the Cookie Store API is not in every browser the apps support, and the value is one of the app's locales
  document.cookie = `${LOCALE_COOKIE}=${encodeURIComponent(locale)}; Path=/${scope}; Max-Age=${LOCALE_COOKIE_MAX_AGE}; SameSite=Lax${secure}`;
};

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
