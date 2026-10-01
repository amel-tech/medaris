import { defineRouting } from "next-intl/routing";

// MDRS-151: the landing page is Turkish only at launch, as the unified design
// system specifies (MDS-LAY-03; Arabic and English are its next phase). One
// locale and no prefix, so the pages live at /, /sss, /iletisim and so on.
export const locales = ["tr"] as const;
export type LandingLocale = (typeof locales)[number];

export const routing = defineRouting({
  locales,
  defaultLocale: "tr",
  localePrefix: "never",
});
