/**
 * The viewer's language choice (MDRS-275). It is kept in this browser only,
 * under `medaris-locale`, and never on the account: the owner's decision of
 * 2026-10-05. The address still decides what a page is in; the stored choice
 * only moves a later visit to it (`LocalePreference`).
 */
export const LOCALE_STORAGE_KEY = "medaris-locale";

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
