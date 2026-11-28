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
const SPACE = /\s/u;
const LATIN = /\p{Script=Latin}/u;

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

/** True when the text holds a Latin letter: a Turkish or an English word, alone or quoting Arabic. */
export const hasLatin = (text) => LATIN.test(text);

/** True when the text holds Arabic script and no Latin letter: it is drawn as an Arabic block. */
export const isArabicOnly = (text) => hasArabic(text) && !hasLatin(text);

/**
 * The direction of a text's paragraph (its base direction): right to left
 * only for a text with Arabic and no Latin letter; any text with a Latin
 * letter, whatever it starts with, takes the interface's direction, `uiDir`
 * ("ltr" for tr and en, "rtl" for ar). Its Arabic runs keep their own
 * direction on their own isolated elements (`arabicRuns`). Not the first
 * strong letter, as `dir="auto"` does: "إِيَّاكَ نَعْبُدُ: "iyyâke" neden
 * başta geliyor?" is a Turkish sentence and reads left to right on a Turkish
 * page. Without `uiDir`, undefined for a text that is not Arabic only: the
 * element then states no direction and takes the page's, which <html dir>
 * sets from the interface language.
 */
export const paragraphDir = (text, uiDir) =>
  isArabicOnly(text) ? "rtl" : uiDir;

/**
 * The attributes of a question's, an option's or an answer's text. Arabic
 * only (`isArabicOnly`): lang="ar" dir="rtl" on the element itself, Naskh at
 * `arabicFontSize`, the harakat leading, isolated so the marks beside it (a
 * list letter, "Doğru") keep their place. Any other text, a mixed one
 * included: the interface's direction (`paragraphDir`), and the size only
 * when one is given.
 */
export const arabicTextProps = (text, size, scale = 1, uiDir) => {
  if (isArabicOnly(text)) {
    return {
      lang: "ar",
      dir: "rtl",
      // Keeps lang="ar" from re-pointing the Latin size tokens on this
      // element (the Arabic region rule of tokens/typography.css), so `size`
      // is read as the Latin size it stands for.
      "data-arabic-block": "",
      style: {
        fontFamily: "var(--font-arabic)",
        fontSize: arabicFontSize(size ?? "1em", scale),
        lineHeight: "var(--lh-arabic-text)",
        unicodeBidi: "isolate",
      },
    };
  }
  const dir = uiDir ? { dir: uiDir } : {};
  if (size === undefined && scale === 1) return dir;
  return {
    ...dir,
    style: {
      fontSize: scale === 1 ? size : `calc(${size ?? "1em"} * ${scale})`,
    },
  };
};

/** True when the text holds both Arabic and Latin letters: a Turkish sentence quoting Arabic, or the other way round. */
export const isMixed = (text) => hasArabic(text) && hasLatin(text);

// The brackets and quotes that open a pair, and the mark that closes each.
// ﴿ ﴾ are not here: their Script_Extensions name Arabic, so they are part
// of an Arabic run already.
const PAIRS = new Map([
  ["(", ")"],
  ["[", "]"],
  ["{", "}"],
  ["«", "»"],
  ["‹", "›"],
  ["“", "”"],
  ["‘", "’"],
  ['"', '"'],
  ["'", "'"],
]);
// A straight quote opens and closes alike, and is an apostrophe in
// "Fâtiha'daki": it joins an Arabic run only when it touches it.
const STRAIGHT = new Set(['"', "'"]);

/**
 * A mixed text cut into its Arabic and its other runs, in order, for a
 * Turkish sentence that quotes Arabic: each Arabic run is drawn on its own
 * right-to-left, isolated element with `arabicTextProps`. An Arabic run is
 * everything from its first Arabic letter to its last, with what lies
 * between (spaces, ":" after ﷺ, a quoted «…»), plus the brackets and quotes
 * around it: an opening one before it (a straight quote only when it
 * touches it) whose pair closes right after it, and the closing ones that
 * pair with what it left open. So
 * «زَيْدٌ» and (قَالَ) are each one run, their marks mirrored the Arabic way,
 * and ﴿…﴾ stays whole. The spaces and the Latin punctuation after an Arabic
 * run belong to the Turkish sentence ("» — bu hadisin", "فَعَلَ?"): inside
 * the run they would land on its left. Joined back, the runs are the text.
 */
export const arabicRuns = (text) => {
  const chars = [...text];
  // 1 Arabic, 0 any other letter or number, -1 neither (space, mark, sign).
  const kind = chars.map((ch) =>
    ARABIC_EXT.test(ch) ? 1 : WORD.test(ch) ? 0 : -1
  );
  const arabic = new Array(chars.length).fill(false);
  let i = 0;
  while (i < chars.length) {
    if (kind[i] !== 1) {
      i += 1;
      continue;
    }
    // From this Arabic letter to the last one before the next other letter.
    let last = i;
    let next = i;
    while (next < chars.length && kind[next] !== 0) {
      if (kind[next] === 1) last = next;
      next += 1;
    }
    // The opening brackets and quotes before it, with the spaces between.
    let first = i;
    for (let k = i - 1; k >= 0 && kind[k] === -1 && !arabic[k]; k -= 1) {
      const ch = chars[k];
      if (SPACE.test(ch)) continue;
      if (!PAIRS.has(ch) || (STRAIGHT.has(ch) && k !== first - 1)) break;
      first = k;
    }
    // What it leaves open, closed by the marks right after it: each as the
    // mark that closes it and the place it opens.
    const open = [];
    for (let k = first; k <= last; k += 1) {
      if (open.length > 0 && chars[k] === open.at(-1).close) open.pop();
      else if (PAIRS.has(chars[k]))
        open.push({ close: PAIRS.get(chars[k]), at: k });
    }
    for (let k = last + 1; k < next && open.length > 0; k += 1) {
      if (SPACE.test(chars[k])) continue;
      if (chars[k] !== open.at(-1).close) break;
      open.pop();
      last = k;
    }
    // An opening mark before it whose pair closes in the Turkish ("(قَالَ
    // fiili)") stays in the Turkish with its pair: split, the two would be
    // drawn in two directions.
    const unclosed = open.filter((pair) => pair.at < i).at(-1);
    if (unclosed) {
      first = unclosed.at + 1;
      while (first < i && SPACE.test(chars[first])) first += 1;
    }
    for (let k = first; k <= last; k += 1) arabic[k] = true;
    i = next;
  }
  const runs = [];
  chars.forEach((ch, k) => {
    const current = runs.at(-1);
    if (current && current.arabic === arabic[k]) current.text += ch;
    else runs.push({ text: ch, arabic: arabic[k] });
  });
  return runs;
};
