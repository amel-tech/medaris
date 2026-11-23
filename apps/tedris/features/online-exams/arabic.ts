import type { CSSProperties } from "react";

const ARABIC = /\p{Script=Arabic}/u;
const LETTER = /\p{L}/u;

/** True when the text's first letter is Arabic script: it is drawn as Arabic. */
export const startsArabic = (text: string): boolean => {
  for (const ch of text) {
    if (ARABIC.test(ch)) return true;
    if (LETTER.test(ch)) return false;
  }
  return false;
};

/**
 * A question's or an option's text at `size` (a CSS length, scaled by the
 * page's A− / A+). An Arabic text is Naskh, never under 1rem times the same
 * scale, with the Arabic leading, and isolated so the marks beside it keep
 * their place (the owner, 22 Nov 2026: "arapça font boyutu küçük kalıyor …
 * 1 rem yapalım").
 */
export const textProps = (
  text: string,
  size: string,
  scale: number
): { lang?: "ar"; dir: "rtl" | "auto"; style: CSSProperties } =>
  startsArabic(text)
    ? {
        lang: "ar",
        dir: "rtl",
        style: {
          fontFamily: "var(--font-arabic)",
          fontSize: `max(calc(1rem * ${scale}), ${size})`,
          lineHeight: "var(--lh-arabic)",
          unicodeBidi: "isolate",
        },
      }
    : { dir: "auto", style: { fontSize: size } };
