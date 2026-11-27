// Arabic text beside Latin text (MDRS-248): the one rule tedris and nazar
// share for a question's, an option's or an answer's text. The values are the
// tokens of tokens/typography.css (libs/tokens/medaris.css), named here, never
// copied: --arabic-scale, --fs-arabic-text-min, --lh-arabic-text and
// --font-arabic. docs/migration/mdrs-248-arapca-metin-standardi.md says why
// they are what they are. Plain JavaScript with a .d.ts beside it, like
// medaris-fonts.js, so every app reaches it without a build step.

const ARABIC = /\p{Script=Arabic}/u;
// Harakat are Script=Inherited; their Script_Extensions name Arabic.
const ARABIC_EXT = /\p{Script_Extensions=Arabic}/u;
const LETTER = /\p{L}/u;
const WORD = /[\p{L}\p{N}]/u;

/** The values of the tokens, for a caller that needs a number (a canvas, a test). */
export const ARABIC_SCALE = 1.4;
export const ARABIC_TEXT_MIN_PX = 18;
export const ARABIC_LINE_HEIGHT = 2;

/** True when the text's first letter is Arabic script: it is drawn as Arabic. */
export const startsArabic = (text) => {
  for (const ch of text) {
    if (ARABIC.test(ch)) return true;
    if (LETTER.test(ch)) return false;
  }
  return false;
};

/** True when the text holds Arabic script anywhere (a Turkish sentence with an Arabic word included). */
export const hasArabic = (text) => ARABIC.test(text);

/**
 * The size of an Arabic text standing for Latin text at `size` (a CSS
 * length): `size` x --arabic-scale, never under --fs-arabic-text-min, both
 * times `scale` (the page's A− / A+, when it scales by number rather than by
 * CSS zoom). So Arabic is the same ratio larger than Turkish at every step.
 */
export const arabicFontSize = (size = "1em", scale = 1) =>
  `max(calc(var(--fs-arabic-text-min) * ${scale}), calc(${size} * var(--arabic-scale) * ${scale}))`;

/**
 * The attributes of a question's, an option's or an answer's text. Arabic
 * (its first letter is): lang="ar" dir="rtl" on the element itself, Naskh at
 * `arabicFontSize`, the harakat leading, isolated so the marks beside it (a
 * list letter, "Doğru") keep their place. Otherwise dir="auto", and the size
 * only when one is given.
 */
export const arabicTextProps = (text, size, scale = 1) => {
  if (startsArabic(text)) {
    return {
      lang: "ar",
      dir: "rtl",
      style: {
        fontFamily: "var(--font-arabic)",
        fontSize: arabicFontSize(size ?? "1em", scale),
        lineHeight: "var(--lh-arabic-text)",
        unicodeBidi: "isolate",
      },
    };
  }
  if (size === undefined && scale === 1) return { dir: "auto" };
  return {
    dir: "auto",
    style: {
      fontSize: scale === 1 ? size : `calc(${size ?? "1em"} * ${scale})`,
    },
  };
};

/**
 * A mixed text cut into its Arabic and its other runs, in order, for a
 * Turkish sentence that quotes Arabic: each Arabic run is drawn on its own
 * element with `arabicTextProps`. Spaces and punctuation stay with the run
 * they fall in, except that the spaces closing an Arabic run go to the next.
 * Joined back, the runs are the text.
 */
export const arabicRuns = (text) => {
  const runs = [];
  let current = null;
  for (const ch of text) {
    const arabic = ARABIC_EXT.test(ch) ? true : WORD.test(ch) ? false : null;
    if (current === null) {
      current = { text: ch, arabic: arabic ?? false };
    } else if (arabic === null || arabic === current.arabic) {
      current.text += ch;
    } else {
      const trailing = current.arabic ? /\s+$/u.exec(current.text) : null;
      const carried = trailing ? trailing[0] : "";
      if (carried) current.text = current.text.slice(0, -carried.length);
      if (current.text) runs.push(current);
      current = { text: carried + ch, arabic };
    }
  }
  if (current) runs.push(current);
  return runs;
};
