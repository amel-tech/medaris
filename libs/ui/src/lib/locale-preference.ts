/**
 * The viewer's language choice (MDRS-275). It is kept in this browser only,
 * under `medaris-locale`, and never on the account: the owner's decision of
 * 2026-10-05. The address still decides what a page is in; the stored choice
 * only moves a later visit to it.
 *
 * It is kept twice. The cookie of the same name lets the app's proxy send a
 * visit straight to the chosen language (`pathInPreferredLocale`), so the page
 * is not rendered in the address's language first and loaded again. Local
 * storage is where the choice lived before the cookie; `LocalePreference`
 * still moves such a visit on the client, and writes the cookie for it.
 */
export const LOCALE_STORAGE_KEY = "medaris-locale";
export const LOCALE_COOKIE = LOCALE_STORAGE_KEY;
const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/** Each language in its own name: the same in every interface language. */
export const LOCALE_NAMES: Record<string, string> = {
  tr: "Türkçe",
  en: "English",
  ar: "العربية",
};

export const readStoredLocale = (locales: readonly string[]): string | null => {
  try {
    const stored = window.localStorage.getItem(LOCALE_STORAGE_KEY);
    return stored && locales.includes(stored) ? stored : null;
  } catch {
    return null;
  }
};

export const storeLocale = (locale: string) => {
  try {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    // storage blocked: the switch still happens, for this visit only
  }
  writeLocaleCookie(locale);
};

/** Whether this browser already sends `locale` in the cookie. */
export const hasLocaleCookie = (locale: string): boolean =>
  document.cookie
    .split("; ")
    .includes(`${LOCALE_COOKIE}=${encodeURIComponent(locale)}`);

/** A year long, for the whole site, `Secure` wherever the page is. */
export const writeLocaleCookie = (locale: string) => {
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  // biome-ignore lint/suspicious/noDocumentCookie: the Cookie Store API is not in every browser the apps support, and the value is one of the app's locales
  document.cookie = `${LOCALE_COOKIE}=${encodeURIComponent(locale)}; Path=/; Max-Age=${LOCALE_COOKIE_MAX_AGE}; SameSite=Lax${secure}`;
};

/**
 * Where the proxy sends a page request to follow the cookie's language, or
 * `null` to serve it as asked: no valid choice, the address already in it, or
 * not a page load (`/api/…`, a Server Action, any method but GET and HEAD).
 * The move `LocalePreference` makes after a render, made before one.
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
