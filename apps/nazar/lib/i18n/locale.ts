/**
 * Nazar's locales. There is no `[locale]` segment: the language is the one
 * the viewer chose in Tedris or Nizam, read from the `medaris-locale` cookie
 * those apps write for the whole Medaris domain (MDRS-248), and Turkish when
 * there is none. next-intl's request config reads it, and so does every trip
 * to Keycloak, whose sign-in and sign-out pages open in it (`ui_locales` and
 * `kc_locale`, MDRS-274, MDRS-222).
 *
 * Turkish only for now: English and Arabic are switched off in every app, and
 * a cookie naming one of them falls back to Turkish.
 */
export const LOCALES = ["tr"] as const;
export type NazarLocale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: NazarLocale = "tr";

/** `value` when it is one of Nazar's locales, otherwise Turkish. */
export const localeOf = (value: string | null | undefined): NazarLocale =>
  LOCALES.find((locale) => locale === value) ?? DEFAULT_LOCALE;

/** What `<html>` carries: Arabic is written right to left. */
export const htmlLangDir = (
  locale: NazarLocale
): { lang: NazarLocale; dir: "ltr" | "rtl" } => ({
  lang: locale,
  dir: (locale as string) === "ar" ? "rtl" : "ltr",
});
