import { defineRouting } from "next-intl/routing";

export const locales = ["tr", "en", "ar"] as const;
export type MadrasahLocale = (typeof locales)[number];

export const routing = defineRouting({
  locales,
  defaultLocale: "tr",
  // Turkish only for now: the browser's language and the locale cookie do
  // not pick the locale; an explicit /en or /ar path still does.
  localeDetection: false,
  pathnames: {
    "/": "/",
  },
});

/**
 * The locale a path is served in (`/en/kosks` → `en`), or `undefined` for a
 * path outside the locale routes. Keeps a visitor's language on the way to
 * sign-in and on Keycloak's own pages (MDRS-274).
 */
export const localeOfPath = (
  path: string | null | undefined
): MadrasahLocale | undefined => {
  const first = path?.split(/[/?#]/)[1];
  return locales.find((locale) => locale === first);
};
