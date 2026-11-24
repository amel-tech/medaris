/**
 * The Turkish side of a sîga: the meaning template on the back of a card.
 *
 * The müderris types the verb once, as its mastar (`yardım etmek`), and every
 * sîga's meaning is derived from it the way the Emsile glosses نَصَرَ: "yardım
 * etti", "yardım eder", "yardım edici", "yardım olunmuş", "yardım etmedi" …
 *
 * This is a template, not a dictionary. Turkish vowel harmony and the common
 * consonant changes are applied; an irregular verb comes out close enough for
 * the müderris to correct, which every screen that shows these lets them do.
 */

const VOWELS = "aeıioöuü";
const BACK = "aıou";
const ROUND = "oöuü";
const VOICELESS = "fstkçşhp";

/** A Turkish verb: the words before it (with their space) and its stem. */
export interface Fiil {
  /** `yardım ` in `yardım etmek`; empty for a bare verb. */
  on: string;
  /** `et` in `yardım etmek`. */
  kok: string;
}

/** Who a Turkish verb is conjugated for; a dual takes the plural's person. */
export type Person = "3sg" | "3pl" | "2sg" | "2pl" | "1sg" | "1pl";

/** The mastar as typed, read as a verb; null when it does not end in -mak/-mek. */
export function readMastar(input: string): Fiil | null {
  const text = input.trim().replace(/\s+/g, " ").toLocaleLowerCase("tr");
  const match = /^(.*\s)?(\S+?)m[ae]k$/.exec(text);
  if (!match) return null;
  const kok = match[2] ?? "";
  if (!Array.from(kok).some((ch) => VOWELS.includes(ch))) return null;
  return { on: match[1] ?? "", kok };
}

const lastVowel = (word: string): string =>
  Array.from(word.toLocaleLowerCase("tr"))
    .reverse()
    .find((ch) => VOWELS.includes(ch)) ?? "e";

const endsInVowel = (word: string): boolean => VOWELS.includes(word.slice(-1));

/** The two-way vowel of a suffix: a after a back vowel, e after a front one. */
const A = (word: string): string =>
  BACK.includes(lastVowel(word)) ? "a" : "e";

/** The four-way vowel of a suffix: ı, i, u or ü. */
const I = (word: string): string => {
  const v = lastVowel(word);
  if (BACK.includes(v)) return ROUND.includes(v) ? "u" : "ı";
  return ROUND.includes(v) ? "ü" : "i";
};

/** d, or t after a voiceless consonant: yazdı, açtı. */
const D = (word: string): string =>
  VOICELESS.includes(word.slice(-1)) ? "t" : "d";

/**
 * The stems whose final t softens before a vowel: et → eder, git → gider. Most
 * do not (işit → işitir, yarat → yaratır), so this is a list, not a rule.
 */
const SOFTENS = new Set([
  "et",
  "git",
  "güt",
  "tat",
  "affet",
  "reddet",
  "hisset",
  "zannet",
  "kaybet",
  "seyret",
  "hallet",
  "sabret",
  "şükret",
  "emret",
  "hükmet",
  "zikret",
  "fethet",
  "defnet",
  "azmet",
  "bahset",
  "kastet",
  "vadet",
  "nakşet",
  "hamdet",
  "kahret",
  "menet",
  "addet",
]);

const soft = (kok: string): string =>
  SOFTENS.has(kok) ? `${kok.slice(0, -1)}d` : kok;

/** The one-syllable stems whose aorist takes the high vowel: gelir, not geler. */
const AORIST_HIGH = new Set([
  "al",
  "bil",
  "bul",
  "dur",
  "gel",
  "gör",
  "kal",
  "ol",
  "öl",
  "san",
  "var",
  "ver",
  "vur",
]);

const syllables = (word: string): number =>
  Array.from(word).filter((ch) => VOWELS.includes(ch)).length;

// ---- the third person of each tense --------------------------------------------

const gecmis = (kok: string) => kok + D(kok) + I(kok);

const genis = (kok: string): string => {
  if (endsInVowel(kok)) return `${kok}r`;
  if (syllables(kok) === 1 && !AORIST_HIGH.has(kok))
    return `${soft(kok)}${A(kok)}r`;
  return `${soft(kok)}${I(kok)}r`;
};

/** The negative stem: etme, vurma. */
const olumsuz = (kok: string) => `${kok}m${A(kok)}`;

const olumsuzSimdiki = (kok: string) => `${kok}m${I(kok)}yor`;

const olumsuzGelecek = (kok: string) => {
  const a = A(kok);
  return `${olumsuz(kok)}y${a}c${a}k`;
};

const emir3 = (kok: string) => `${kok}s${I(kok)}n`;

const olumsuzEmir3 = (kok: string) => {
  const stem = olumsuz(kok);
  return `${stem}s${I(stem)}n`;
};

/** edecek, vuracak, okuyacak: what the ism-i zaman, mekân and âlet lean on. */
const gelecekSifat = (kok: string): string => {
  const a = A(kok);
  return endsInVowel(kok) ? `${kok}y${a}c${a}k` : `${soft(kok)}${a}c${a}k`;
};

/** edici, vurucu, okuyucu. */
const edici = (kok: string): string => {
  const i = I(kok);
  return endsInVowel(kok) ? `${kok}y${i}c${i}` : `${soft(kok)}${i}c${i}`;
};

/**
 * The passive stem. A compound with etmek is glossed with olunmak, as the
 * Emsile does ("yardım olunmuş"); a bare verb takes its own passive.
 */
const edilgenKok = ({ on, kok }: Fiil): string => {
  if (kok === "et" && on !== "") return "olun";
  if (endsInVowel(kok)) return `${kok}n`;
  if (kok.endsWith("l")) return `${kok}${I(kok)}n`;
  return `${soft(kok)}${I(kok)}l`;
};

// ---- the persons ---------------------------------------------------------------

/** The endings of the past: -m, -n, -k, -niz, -ler. */
const kisiGecmis = (base: string, person: Person): string => {
  switch (person) {
    case "3sg":
      return base;
    case "3pl":
      return `${base}l${A(base)}r`;
    case "2sg":
      return `${base}n`;
    case "2pl":
      return `${base}n${I(base)}z`;
    case "1sg":
      return `${base}m`;
    case "1pl":
      return `${base}k`;
  }
};

/** The endings of every other tense: -im, -sin, -iz, -siniz, -ler. */
const kisiGenis = (base: string, person: Person): string => {
  const i = I(base);
  // The k of -ecek softens before a vowel: edeceğim.
  const open = base.endsWith("k") ? `${base.slice(0, -1)}ğ` : base;
  switch (person) {
    case "3sg":
      return base;
    case "3pl":
      return `${base}l${A(base)}r`;
    case "2sg":
      return `${base}s${i}n`;
    case "2pl":
      return `${base}s${i}n${i}z`;
    case "1sg":
      return `${open}${i}m`;
    case "1pl":
      return `${open}${i}z`;
  }
};

/** The negative aorist keeps its own persons: etmem, etmezsin, etmeyiz. */
const kisiOlumsuzGenis = (kok: string, person: Person): string => {
  const stem = olumsuz(kok);
  const i = I(stem);
  switch (person) {
    case "3sg":
      return `${stem}z`;
    case "3pl":
      return `${stem}zl${A(stem)}r`;
    case "2sg":
      return `${stem}zs${i}n`;
    case "2pl":
      return `${stem}zs${i}n${i}z`;
    case "1sg":
      return `${stem}m`;
    case "1pl":
      return `${stem}y${i}z`;
  }
};

export type Zaman =
  | "gecmis"
  | "genis"
  | "olumsuzGecmis"
  | "olumsuzSimdiki"
  | "olumsuzGenis"
  | "olumsuzGelecek"
  | "emir"
  | "olumsuzEmir";

/**
 * The verb in a tense and a person, with the words before it. The imperative
 * has no first person: asked for one, it answers with the third.
 */
export function cek(
  fiil: Fiil,
  zaman: Zaman,
  person: Person,
  edilgen = false
): string {
  const kok = edilgen ? edilgenKok(fiil) : fiil.kok;
  const word = (): string => {
    switch (zaman) {
      case "gecmis":
        return kisiGecmis(gecmis(kok), person);
      case "genis":
        return kisiGenis(genis(kok), person);
      case "olumsuzGecmis":
        return kisiGecmis(gecmis(olumsuz(kok)), person);
      case "olumsuzSimdiki":
        return kisiGenis(olumsuzSimdiki(kok), person);
      case "olumsuzGenis":
        return kisiOlumsuzGenis(kok, person);
      case "olumsuzGelecek":
        return kisiGenis(olumsuzGelecek(kok), person);
      case "emir":
        if (person === "2sg") return kok;
        if (person === "2pl")
          return endsInVowel(kok)
            ? `${kok}y${I(kok)}n`
            : `${soft(kok)}${I(kok)}n`;
        return person === "3pl" ? `${emir3(kok)}l${A(kok)}r` : emir3(kok);
      case "olumsuzEmir": {
        const stem = olumsuz(kok);
        if (person === "2sg") return stem;
        if (person === "2pl") return `${stem}y${I(stem)}n`;
        return person === "3pl"
          ? `${olumsuzEmir3(kok)}l${A(stem)}r`
          : olumsuzEmir3(kok);
      }
    }
  };
  return fiil.on + word();
}

// ---- the nouns -----------------------------------------------------------------

/** The plural of the last word: ediciler, zamanlar. */
export const cogul = (phrase: string): string => `${phrase}l${A(phrase)}r`;

/** yardım etmek. */
export const mastarOf = ({ on, kok }: Fiil): string => `${on}${kok}m${A(kok)}k`;

/** yardım etmeler: the masdar's plural. */
export const mastarCogul = ({ on, kok }: Fiil): string =>
  cogul(`${on}${olumsuz(kok)}`);

/** yardım etmeye: the mastar leaning on the next word. */
export const mastarYonelme = ({ on, kok }: Fiil): string =>
  `${on}${olumsuz(kok)}y${A(kok)}`;

/** yardım edici. */
export const ediciOf = ({ on, kok }: Fiil): string => on + edici(kok);

/** yardım olunmuş. */
export const edilmisOf = (fiil: Fiil): string => {
  const stem = edilgenKok(fiil);
  return `${fiil.on}${stem}m${I(stem)}ş`;
};

/** yardım edecek. */
export const edecekOf = ({ on, kok }: Fiil): string => on + gelecekSifat(kok);

// ---- the meaning as typed (the first generator's dialog) -------------------------

/**
 * The meaning, as typed for "O yaptı" / "O yapıyor" / "O yapar", turned to a
 * person. A past in -dı/-tı, a present in -yor and an aorist in -r (the
 * Emsile's "yardım eder") are conjugated; anything else is kept as typed after
 * the person, for the müderris to finish.
 */
export function conjugateMeaning(meaning: string, person: Person): string {
  const m = meaning.trim();
  if (m === "") return "";
  if (/yor$/.test(m)) return kisiGenis(m, person);
  if (/[dt][ıiuü]$/.test(m)) return kisiGecmis(m, person);
  if (/[aeıioöuü]r$/.test(m)) return kisiGenis(m, person);
  return m;
}
