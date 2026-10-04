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
