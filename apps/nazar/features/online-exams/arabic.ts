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
 * An Arabic run (the owner, 22 Nov 2026: "arapça font boyutu küçük kalıyor
 * … 1 rem yapalım"): Naskh, never under 1rem, the Arabic leading, and
 * isolated, so a list's letter or a "Doğru" beside it keeps its place.
 */
const ARABIC_RUN: CSSProperties = {
  fontFamily: "var(--font-arabic)",
  fontSize: "max(1rem, 1em)",
  lineHeight: "var(--lh-arabic)",
  unicodeBidi: "isolate",
};

/** The attributes of a question's or an option's text: Arabic, or left to the browser. */
export const textProps = (
  text: string
): { lang?: "ar"; dir: "rtl" | "auto"; style?: CSSProperties } =>
  startsArabic(text)
    ? { lang: "ar", dir: "rtl", style: ARABIC_RUN }
    : { dir: "auto" };
