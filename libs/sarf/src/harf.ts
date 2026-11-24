/**
 * The letters and marks the sarf engine writes with, and the reading of a
 * typed root.
 *
 * Every mark is its own code point and a shadda is written before its vowel
 * (`نَّ` is nûn, shadda, fatha), the order a keyboard produces. A spec that
 * compares against typed Arabic normalises both sides first.
 */

export const FATHA = "َ";
export const DAMMA = "ُ";
export const KASRA = "ِ";
export const SUKUN = "ْ";
export const SHADDA = "ّ";
export const FATHATAN = "ً";
export const DAMMATAN = "ٌ";
export const KASRATAN = "ٍ";
export const ALIF = "ا";
export const ALIF_MAKSURA = "ى";
export const WAW = "و";
export const YA = "ي";
export const TA = "ت";
export const TA_MARBUTA = "ة";
export const NUN = "ن";
export const MIM = "م";
export const LAM = "ل";
export const HAMZA_ALIF = "أ";

export type Vowel = typeof FATHA | typeof DAMMA | typeof KASRA;

/** The three letters of a root: fâ, ayn, lâm. */
export type Root = readonly [string, string, string];

/** Hamza in every seat, the weak letters and the alif forms: not sâlim. */
const NOT_SALIM = new Set([
  "ء",
  "آ",
  "أ",
  "ؤ",
  "إ",
  "ئ",
  ALIF,
  ALIF_MAKSURA,
  WAW,
  YA,
]);

/**
 * The Arabic letters (hamza to yā'), without the vowel marks. Tâ marbûta (ة)
 * ends a noun and is never a root letter, so it is left out and a root that
 * holds one is refused as `letters`.
 */
const LETTER = /[ء-بت-غف-ي]/;

export type RootProblem = "required" | "letters" | "weak" | "doubled";

/**
 * A typed root as its three letters, or why it cannot be conjugated here.
 * Spaces, tatweel and any vowel marks the müderris typed are ignored.
 */
export function readRoot(
  input: string
): { letters: [string, string, string] } | { problem: RootProblem } {
  const letters = Array.from(input).filter((ch) => LETTER.test(ch));
  const stray = Array.from(input).filter(
    (ch) => !LETTER.test(ch) && !/[\sـً-ْ]/.test(ch)
  );
  if (letters.length === 0 && stray.length === 0)
    return { problem: "required" };
  // A doubled root is often typed as it is written, two letters and a
  // shadda (مدّ): that is the muzâaf, not a letter missing.
  if (stray.length === 0 && letters.length === 2 && input.includes(SHADDA))
    return { problem: "doubled" };
  if (stray.length > 0 || letters.length !== 3) return { problem: "letters" };
  if (letters.some((ch) => NOT_SALIM.has(ch))) return { problem: "weak" };
  if (letters[1] === letters[2]) return { problem: "doubled" };
  return { letters: letters as [string, string, string] };
}

/**
 * The last root letter and its ending. When the letter is the same as the
 * suffix's first (a lâm of nûn before نَ, of tâ before تَ), the two merge into
 * one with a shadda, as the books write it: سَكَنَّا, سَكَتُّ.
 */
export function close(lam: string, ending: string): string {
  if (ending.startsWith(SUKUN) && ending[1] === lam) {
    return lam + SHADDA + ending.slice(2);
  }
  return lam + ending;
}
