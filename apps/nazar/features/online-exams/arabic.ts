import { isMixed, mixedDir, startsArabic } from "@medaris/tokens/arabic";

/**
 * A question's, an option's or an answer's text: the Arabic text standard of
 * the design system (MDRS-248), one module for tedris and nazar. An Arabic
 * text is Naskh at the Latin size it stands for times --arabic-scale (1.4),
 * never under --fs-arabic-text-min (18px), at the harakat leading
 * (--lh-arabic-text, 2), with lang="ar" dir="rtl" on the element and
 * isolated; any other text gets dir="auto". A− / A+ multiply the result, so
 * Arabic stays the same ratio larger than Turkish at every step.
 * See docs/migration/mdrs-248-arapca-metin-standardi.md.
 */
export {
  arabicRuns,
  arabicTextProps as textProps,
  hasArabic,
  isMixed,
  mixedDir,
  startsArabic,
} from "@medaris/tokens/arabic";

/**
 * The direction of the box a question's text is drawn in: its frame's for a
 * mixed text (a Turkish question that opens with a hadith is left to right),
 * right to left for an Arabic one, the page's otherwise.
 */
export const boxDir = (text: string): "rtl" | "ltr" | undefined =>
  isMixed(text) ? mixedDir(text) : startsArabic(text) ? "rtl" : undefined;
