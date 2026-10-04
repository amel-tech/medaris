import { defineRouting } from "next-intl/routing";

export const locales = ["tr", "en", "ar"] as const;
export type MadrasahLocale = (typeof locales)[number];

export const routing = defineRouting({
  locales,
  defaultLocale: "tr",
  pathnames: {
    "/": "/",
  },
});
