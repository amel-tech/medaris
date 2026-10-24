/**
 * The sîga generator of a course deck (MDRS-248): the müderris types a root
 * (`ن ص ر`) and picks its bâb, and the fourteen mâzî and fourteen muzâri sîgas
 * of the ma'lûm come back as draft cards, the Arabic fully vowelled on the
 * front and a meaning template on the back for the müderris to correct.
 *
 * Scope: sülâsî mücerred, sâlim, ma'lûm. A root with a hamza or a weak letter,
 * or a doubled one, is refused rather than conjugated wrongly.
 *
 * Every card carries its sîga in `contentMeta`: `{ kok, bab, kip, sahis,
 * cinsiyet, sayi }`, every value a plain ASCII key. tedris-web reads the same
 * keys to lay a deck out as a sîga table; the two apps cannot import each
 * other, so each pins the literal keys in its own spec.
 *
 * Pure and platform-free: no DOM, no Node, so the dialog and a spec call it the
 * same way.
 */

import { FACE_MAX, FACE_MIN } from "./decks";

export type SigaKip = "mazi" | "muzari";
export type SigaSahis = "gaib" | "muhatab" | "mutekellim";
export type SigaCinsiyet = "muzekker" | "muennes";
export type SigaSayi = "mufred" | "tesniye" | "cem";

export interface SigaMeta {
  kok: string;
  bab: BabKey;
  kip: SigaKip;
  sahis: SigaSahis;
  /** Null for the mütekellim, whose forms do not change with gender. */
  cinsiyet: SigaCinsiyet | null;
  sayi: SigaSayi;
}

export interface SigaDraft {
  contentFront: string;
  contentBack: string;
  contentMeta: SigaMeta;
}

// ---- the letters --------------------------------------------------------------

const FATHA = "َ";
const DAMMA = "ُ";
const KASRA = "ِ";
const SUKUN = "ْ";
const SHADDA = "ّ";
const ALIF = "ا";
const WAW = "و";
const YA = "ي";
const TA = "ت";
const NUN = "ن";
const MIM = "م";
const HAMZA_ALIF = "أ";

/** Hamza in every seat, the weak letters and the alif forms: not sâlim. */
const NOT_SALIM = new Set([
  "ء", // ء
  "آ", // آ
  "أ", // أ
  "ؤ", // ؤ
  "إ", // إ
  "ئ", // ئ
  ALIF,
  "ى", // ى
  WAW,
  YA,
]);

/**
 * The Arabic letters (hamza to yā'), without the vowel marks. Tâ marbûta (ة)
 * ends a noun and is never a root letter, so it is left out and a root that
 * holds one is refused as `letters`.
 */
const LETTER = /[\u0621-\u0628\u062A-\u063A\u0641-\u064A]/;

// ---- the bâbs -----------------------------------------------------------------

type Vowel = typeof FATHA | typeof DAMMA | typeof KASRA;

/**
 * The six bâbs of the sülâsî mücerred, each by its model verb: the vowel of
 * the middle letter in the mâzî and in the muzâri. `latin` names it in the
 * bâb picker, whose options are plain text and cannot set Arabic right.
 */
export const BABS = {
  nasara: {
    mazi: FATHA,
    muzari: DAMMA,
    name: "نَصَرَ يَنْصُرُ",
    latin: "Nasara – yensuru",
  },
  daraba: {
    mazi: FATHA,
    muzari: KASRA,
    name: "ضَرَبَ يَضْرِبُ",
    latin: "Daraba – yadribu",
  },
  fataha: {
    mazi: FATHA,
    muzari: FATHA,
    name: "فَتَحَ يَفْتَحُ",
    latin: "Fetaha – yeftehu",
  },
  semia: {
    mazi: KASRA,
    muzari: FATHA,
    name: "سَمِعَ يَسْمَعُ",
    latin: "Semi'a – yesme'u",
  },
  hasune: {
    mazi: DAMMA,
    muzari: DAMMA,
    name: "حَسُنَ يَحْسُنُ",
    latin: "Hasune – yahsunu",
  },
  hasibe: {
    mazi: KASRA,
    muzari: KASRA,
    name: "حَسِبَ يَحْسِبُ",
    latin: "Hasibe – yahsibu",
  },
} as const satisfies Record<
  string,
  { mazi: Vowel; muzari: Vowel; name: string; latin: string }
>;

export type BabKey = keyof typeof BABS;

export const BAB_KEYS = Object.keys(BABS) as BabKey[];

// ---- the root -----------------------------------------------------------------

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

// ---- the sîgas ----------------------------------------------------------------

interface Slot {
  sahis: SigaSahis;
  cinsiyet: SigaCinsiyet | null;
  sayi: SigaSayi;
}

/** The fourteen sîgas in a sarf book's order. */
export const SLOTS: readonly Slot[] = [
  { sahis: "gaib", cinsiyet: "muzekker", sayi: "mufred" },
  { sahis: "gaib", cinsiyet: "muzekker", sayi: "tesniye" },
  { sahis: "gaib", cinsiyet: "muzekker", sayi: "cem" },
  { sahis: "gaib", cinsiyet: "muennes", sayi: "mufred" },
  { sahis: "gaib", cinsiyet: "muennes", sayi: "tesniye" },
  { sahis: "gaib", cinsiyet: "muennes", sayi: "cem" },
  { sahis: "muhatab", cinsiyet: "muzekker", sayi: "mufred" },
  { sahis: "muhatab", cinsiyet: "muzekker", sayi: "tesniye" },
  { sahis: "muhatab", cinsiyet: "muzekker", sayi: "cem" },
  { sahis: "muhatab", cinsiyet: "muennes", sayi: "mufred" },
  { sahis: "muhatab", cinsiyet: "muennes", sayi: "tesniye" },
  { sahis: "muhatab", cinsiyet: "muennes", sayi: "cem" },
  { sahis: "mutekellim", cinsiyet: null, sayi: "mufred" },
  { sahis: "mutekellim", cinsiyet: null, sayi: "cem" },
];

/**
 * The mâzî endings, in SLOTS order: the vowel or sukun on the last root letter,
 * then the suffix. The waw of the plural takes the alif al-fâriqa.
 */
const MAZI_ENDINGS: readonly string[] = [
  FATHA,
  FATHA + ALIF,
  DAMMA + WAW + ALIF,
  FATHA + TA + SUKUN,
  FATHA + TA + FATHA + ALIF,
  SUKUN + NUN + FATHA,
  SUKUN + TA + FATHA,
  SUKUN + TA + DAMMA + MIM + FATHA + ALIF,
  SUKUN + TA + DAMMA + MIM + SUKUN,
  SUKUN + TA + KASRA,
  SUKUN + TA + DAMMA + MIM + FATHA + ALIF,
  SUKUN + TA + DAMMA + NUN + SHADDA + FATHA,
  SUKUN + TA + DAMMA,
  SUKUN + NUN + FATHA + ALIF,
];

/** The muzâri prefixes and endings, in SLOTS order. */
const MUZARI: readonly [string, string][] = [
  [YA, DAMMA],
  [YA, FATHA + ALIF + NUN + KASRA],
  [YA, DAMMA + WAW + NUN + FATHA],
  [TA, DAMMA],
  [TA, FATHA + ALIF + NUN + KASRA],
  [YA, SUKUN + NUN + FATHA],
  [TA, DAMMA],
  [TA, FATHA + ALIF + NUN + KASRA],
  [TA, DAMMA + WAW + NUN + FATHA],
  [TA, KASRA + YA + NUN + FATHA],
  [TA, FATHA + ALIF + NUN + KASRA],
  [TA, SUKUN + NUN + FATHA],
  [HAMZA_ALIF, DAMMA],
  [NUN, DAMMA],
];

/**
 * The last root letter and its ending. When the letter is the same as the
 * suffix's first (a lâm of nûn before نَ, of tâ before تَ), the two merge into
 * one with a shadda, as the books write it: سَكَنَّا, سَكَتُّ.
 */
function close(lam: string, ending: string): string {
  if (ending.startsWith(SUKUN) && ending[1] === lam) {
    return lam + SHADDA + ending.slice(2);
  }
  return lam + ending;
}

export function mazi(
  [fa, ayn, lam]: readonly [string, string, string],
  bab: BabKey
): string[] {
  const stem = fa + FATHA + ayn + BABS[bab].mazi;
  return MAZI_ENDINGS.map((ending) => stem + close(lam, ending));
}

export function muzari(
  [fa, ayn, lam]: readonly [string, string, string],
  bab: BabKey
): string[] {
  const stem = fa + SUKUN + ayn + BABS[bab].muzari;
  return MUZARI.map(
    ([prefix, ending]) => prefix + FATHA + stem + close(lam, ending)
  );
}

// ---- the meaning templates ----------------------------------------------------

/** Who acts, in Turkish, in SLOTS order: the back face starts with it. */
const WHO: readonly string[] = [
  "O (erkek)",
  "O ikisi (erkek)",
  "Onlar (erkekler)",
  "O (kadın)",
  "O ikisi (kadın)",
  "Onlar (kadınlar)",
  "Sen (erkek)",
  "Siz ikiniz (erkek)",
  "Siz (erkekler)",
  "Sen (kadın)",
  "Siz ikiniz (kadın)",
  "Siz (kadınlar)",
  "Ben",
  "Biz",
];

/** The Turkish verb's person in SLOTS order: a dual takes the plural's. */
type Person = "3sg" | "3pl" | "2sg" | "2pl" | "1sg" | "1pl";
const PERSON: readonly Person[] = [
  "3sg",
  "3sg",
  "3pl",
  "3sg",
  "3sg",
  "3pl",
  "2sg",
  "2pl",
  "2pl",
  "2sg",
  "2pl",
  "2pl",
  "1sg",
  "1pl",
];

const BACK_VOWELS = "aıou";

const lastVowel = (word: string): string | undefined =>
  Array.from(word.toLocaleLowerCase("tr"))
    .reverse()
    .find((ch) => "aeıioöuü".includes(ch));

/**
 * The meaning, as typed for "O yaptı" / "O yapıyor" / "O yapar", turned to a
 * person. A past in -dı/-tı, a present in -yor and an aorist in -r (the
 * Emsile's "yardım eder") are conjugated; anything else is kept as typed after
 * the person, for the müderris to finish.
 */
export function conjugateMeaning(meaning: string, person: Person): string {
  const m = meaning.trim();
  if (m === "") return "";
  if (/yor$/.test(m)) {
    const ending = {
      "3sg": "",
      "3pl": "lar",
      "2sg": "sun",
      "2pl": "sunuz",
      "1sg": "um",
      "1pl": "uz",
    }[person];
    return m + ending;
  }
  if (/[dt][ıiuü]$/.test(m)) {
    const v = lastVowel(m) ?? "ı";
    const back = BACK_VOWELS.includes(v);
    const ending = {
      "3sg": "",
      "3pl": back ? "lar" : "ler",
      "2sg": "n",
      "2pl": `n${v}z`,
      "1sg": "m",
      "1pl": "k",
    }[person];
    return m + ending;
  }
  if (/[aeıioöuü]r$/.test(m)) {
    const v = lastVowel(m) ?? "ı";
    // The aorist's own vowel decides the personal endings' (yazar → yazarım,
    // eder → ederim, okur → okurum, görür → görürüm).
    const high =
      { a: "ı", ı: "ı", o: "u", u: "u", e: "i", i: "i", ö: "ü", ü: "ü" }[v] ??
      "ı";
    const ending = {
      "3sg": "",
      "3pl": BACK_VOWELS.includes(v) ? "lar" : "ler",
      "2sg": `s${high}n`,
      "2pl": `s${high}n${high}z`,
      "1sg": `${high}m`,
      "1pl": `${high}z`,
    }[person];
    return m + ending;
  }
  return m;
}

// ---- the drafts ---------------------------------------------------------------

export interface SigaRequest {
  root: string;
  bab: BabKey;
  kips: readonly SigaKip[];
  /** The mâzî meaning as "O … " says it: `yardım etti`. */
  maziMeaning: string;
  /** The muzâri meaning as "O … " says it: `yardım ediyor`. */
  muzariMeaning: string;
}

/**
 * Every draft card of the request, the mâzî first. Null when the root cannot
 * be conjugated (`readRoot` says why).
 */
export function generateSigas(request: SigaRequest): SigaDraft[] | null {
  const root = readRoot(request.root);
  if (!("letters" in root)) return null;
  const kok = root.letters.join(" ");
  const drafts: SigaDraft[] = [];
  for (const kip of ["mazi", "muzari"] as const) {
    if (!request.kips.includes(kip)) continue;
    const forms =
      kip === "mazi"
        ? mazi(root.letters, request.bab)
        : muzari(root.letters, request.bab);
    const meaning =
      kip === "mazi" ? request.maziMeaning : request.muzariMeaning;
    SLOTS.forEach((slot, i) => {
      const verb = conjugateMeaning(meaning, PERSON[i]);
      drafts.push({
        contentFront: forms[i],
        contentBack: verb ? `${WHO[i]} ${verb}` : "",
        contentMeta: { kok, bab: request.bab, kip, ...slot },
      });
    });
  }
  return drafts;
}

/**
 * The drafts the müderris left too short or too long, by index: both faces are
 * 3 to 5000 characters, as on "Kart ekle". An emptied back (no meaning was
 * typed) is one of them.
 */
export function sigaDraftProblems(drafts: readonly SigaDraft[]): number[] {
  const bad = (face: string) => {
    const length = face.trim().length;
    return length < FACE_MIN || length > FACE_MAX;
  };
  return drafts.flatMap((draft, i) =>
    bad(draft.contentFront) || bad(draft.contentBack) ? [i] : []
  );
}
