/**
 * The search and the order of a course's glossary (lügat), the same for the
 * müderris who keeps it (nazar-web) and the talebe who reads it (tedris-web).
 * Pure.
 */

/** What a glossary's search reads of a term. */
export interface SearchableTerm {
  term: string;
  arabic: string | null;
  lexicalMeaning: string | null;
  technicalMeaning: string | null;
  example: string | null;
}

/** The Arabic vowel marks, the dagger alif and the tatweel: left out of a search. */
const HAREKE = /[ً-ْٰـ]/g;

/**
 * A text as the search compares it: lower case in the page's language, the
 * circumflex of a transliteration dropped (`mâzî` is found by `mazi`) and an
 * Arabic word without its vowel marks (`الْمَاضِي` by `الماضي`).
 */
export const termSearchKey = (text: string, locale: string): string =>
  text
    .replace(HAREKE, "")
    .toLocaleLowerCase(locale)
    .replace(/â/g, "a")
    .replace(/î/g, "i")
    .replace(/û/g, "u")
    .trim();

/**
 * The terms a search finds, by the term, its Arabic, either meaning or the
 * example, in the alphabet of the page's language. An empty search finds
 * every term.
 */
export function findTerms<T extends SearchableTerm>(
  terms: readonly T[],
  query: string,
  locale: string
): T[] {
  const needle = termSearchKey(query, locale);
  const found =
    needle === ""
      ? [...terms]
      : terms.filter((term) =>
          [
            term.term,
            term.arabic,
            term.lexicalMeaning,
            term.technicalMeaning,
            term.example,
          ].some(
            (text) =>
              text !== null && termSearchKey(text, locale).includes(needle)
          )
        );
  const collator = new Intl.Collator(locale, { sensitivity: "base" });
  return found.sort((a, b) => collator.compare(a.term, b.term));
}
