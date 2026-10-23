import { defineRouting } from "next-intl/routing";

export const locales = ["tr", "en", "ar"] as const;
export type MadrasahLocale = (typeof locales)[number];

/**
 * No locale in the address (MDRS-248): `/courses/1` is the same page in every
 * language, and the language is the viewer's choice in the `medaris-locale`
 * cookie (`lib/i18n/request.ts`), Turkish without one. The routing is kept
 * only for next-intl's typed `Link` and `redirect` (`navigation.ts`).
 */
export const routing = defineRouting({
  locales,
  defaultLocale: "tr",
  localePrefix: "never",
  localeDetection: false,
  pathnames: {
    "/": "/",
    "/home": "/home",
    "/account": "/account",
    "/account/calendar": "/account/calendar",
  },
});

/** `value` when it is one of the locales, otherwise Turkish. */
export const localeOf = (value: string | null | undefined): MadrasahLocale =>
  locales.find((locale) => locale === value) ?? routing.defaultLocale;
