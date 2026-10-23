/**
 * The viewer's language choice (MDRS-275). It is kept in this browser only,
 * in the `medaris-locale` cookie, and never on the account: the owner's
 * decision of 2026-10-05. A cookie rather than local storage so the app's
 * proxy can read it and send a visit straight to the chosen language before
 * anything renders (`pathInPreferredLocale`). One choice for every Medaris
 * app (MDRS-248): the cookie is set on the parent domain, so a language picked
 * in Tedris is the one Nizam and Nazar open in.
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
 * Where the proxy sends a page request to follow the cookie's language, or
 * `null` to serve it as asked: no valid choice, the address already in it, or
 * not a page load (`/api/…`, a Server Action, any method but GET and HEAD).
 */
export const pathInPreferredLocale = (
  {
    method,
    pathname,
    search,
    isServerAction,
  }: {
    method: string;
    pathname: string;
    search: string;
    isServerAction: boolean;
  },
  preferred: string | undefined,
  locales: readonly string[]
): string | null => {
  if (!preferred || !locales.includes(preferred)) return null;
  if ((method !== "GET" && method !== "HEAD") || isServerAction) return null;
  const first = pathname.split("/")[1] ?? "";
  if (first === preferred || first === "api") return null;
  return localeHref(preferred, locales, { pathname, search, hash: "" });
};

/**
 * The same page in `next`: the first path segment is the locale when it is
 * one of `locales`, otherwise `next` is put in front. Query and hash stay.
 */
export const localeHref = (
  next: string,
  locales: readonly string[],
  { pathname, search, hash }: { pathname: string; search: string; hash: string }
): string => {
  const segments = pathname.split("/");
  const first = segments[1] ?? "";
  const rest = locales.includes(first)
    ? segments.slice(2).join("/")
    : segments.slice(1).join("/");
  return `/${next}${rest ? `/${rest}` : ""}${search}${hash}`;
};
