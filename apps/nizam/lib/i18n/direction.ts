import type { MadrasahLocale } from "./routing";

export type TextDirection = "ltr" | "rtl";

/**
 * The routed locales written right to left. Listed rather than asked of
 * `Intl.Locale#getTextInfo`, which not every browser and Node build ships.
 */
const RIGHT_TO_LEFT: ReadonlySet<MadrasahLocale> = new Set(["ar"]);

/**
 * What `<html>` carries for a routed locale (MDRS-230): `lang` so screen
 * readers, hyphenation and fonts pick the right language, and `dir` so the
 * shell — flex order, logical margins, directional icons — mirrors on
 * `/ar/*` instead of staying left to right.
 *
 * The same name and shape as tedris-web's `lib/i18n/direction.ts`
 * (MDRS-217); the two belong in `@medaris/i18n` once both have landed.
 */
export const htmlLangDir = (
  locale: MadrasahLocale
): { lang: MadrasahLocale; dir: TextDirection } => ({
  lang: locale,
  dir: RIGHT_TO_LEFT.has(locale) ? "rtl" : "ltr",
});
