/**
 * The fiil sîgas of the sülâsî mücerred sâlim: the mâzî, the muzâri in its
 * three i'râbs, and everything the Emsile builds on the muzâri by putting a
 * harf before it (لَمْ, لَمَّا, مَا, لَا, لَنْ, لِ) or by taking its prefix
 * away (the emr-i hâzır).
 *
 * Each function answers with fourteen forms in SLOTS order.
 */

import { BABS, type BabKey } from "./bab";
import {
  ALIF,
  close,
  DAMMA,
  FATHA,
  HAMZA_ALIF,
  KASRA,
  LAM,
  MIM,
  NUN,
  type Root,
  SHADDA,
  SUKUN,
  TA,
  WAW,
  YA,
} from "./harf";
import { type Bina, type SigaKip, slotApplies } from "./siga";

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

/** The muzâri prefixes, in SLOTS order. */
const MUZARI_PREFIXES: readonly string[] = [
  YA,
  YA,
  YA,
  TA,
  TA,
  YA,
  TA,
  TA,
  TA,
  TA,
  TA,
  TA,
  HAMZA_ALIF,
  NUN,
];

/** What a muzâri's ending is made of, in SLOTS order. */
type Ending = "tek" | "tesniye" | "cem" | "muhataba" | "nisve";
const MUZARI_ENDINGS: readonly Ending[] = [
  "tek",
  "tesniye",
  "cem",
  "tek",
  "tesniye",
  "nisve",
  "tek",
  "tesniye",
  "cem",
  "muhataba",
  "tesniye",
  "nisve",
  "tek",
  "tek",
];

/** The i'râb of the muzâri: merfû' as it stands, mansûb after لَنْ, meczûm after لَمْ. */
export type Irab = "merfu" | "mansub" | "meczum";

/**
 * The five forms with a nûn of i'râb (the ef'âl-i hamse) lose it in the nasb
 * and the cezm, and the waw of the plural then takes its alif; the nûn-i nisve
 * is a pronoun and never drops.
 */
const ENDINGS: Record<Irab, Record<Ending, string>> = {
  merfu: {
    tek: DAMMA,
    tesniye: FATHA + ALIF + NUN + KASRA,
    cem: DAMMA + WAW + NUN + FATHA,
    muhataba: KASRA + YA + NUN + FATHA,
    nisve: SUKUN + NUN + FATHA,
  },
  mansub: {
    tek: FATHA,
    tesniye: FATHA + ALIF,
    cem: DAMMA + WAW + ALIF,
    muhataba: KASRA + YA,
    nisve: SUKUN + NUN + FATHA,
  },
  meczum: {
    tek: SUKUN,
    tesniye: FATHA + ALIF,
    cem: DAMMA + WAW + ALIF,
    muhataba: KASRA + YA,
    nisve: SUKUN + NUN + FATHA,
  },
};

/** نَصَرَ … in the ma'lûm, نُصِرَ … in the mechûl. */
export function maziOf(
  [fa, ayn, lam]: Root,
  bab: BabKey,
  bina: Bina = "malum"
): string[] {
  const stem =
    bina === "malum"
      ? fa + FATHA + ayn + BABS[bab].mazi
      : fa + DAMMA + ayn + KASRA;
  return MAZI_ENDINGS.map((ending) => stem + close(lam, ending));
}

/** يَنْصُرُ … in the ma'lûm, يُنْصَرُ … in the mechûl, in the i'râb asked for. */
export function muzariOf(
  [fa, ayn, lam]: Root,
  bab: BabKey,
  bina: Bina = "malum",
  irab: Irab = "merfu"
): string[] {
  const prefixVowel = bina === "malum" ? FATHA : DAMMA;
  const stem = fa + SUKUN + ayn + (bina === "malum" ? BABS[bab].muzari : FATHA);
  return MUZARI_PREFIXES.map((prefix, i) => {
    const ending = ENDINGS[irab][MUZARI_ENDINGS[i] ?? "tek"];
    return prefix + prefixVowel + stem + close(lam, ending);
  });
}

const LEM = `${LAM}${FATHA}${MIM}${SUKUN} `;
const LEMMA = `${LAM}${FATHA}${MIM}${SHADDA}${FATHA}${ALIF} `;
const MA = `${MIM}${FATHA}${ALIF} `;
const LA = `${LAM}${FATHA}${ALIF} `;
const LEN = `${LAM}${FATHA}${NUN}${SUKUN} `;
/** The lâm of the emir is written onto the fiil: لِيَنْصُرْ. */
const LI = LAM + KASRA;

/**
 * The emr-i hâzır of the ma'lûm: the meczûm muhatab without its prefix, and a
 * hamze-i vasl in front since what is left starts with a sukun. The hamze
 * takes a damma when the ayn of the muzâri has one (اُنْصُرْ), a kesra
 * otherwise (اِضْرِبْ, اِفْتَحْ).
 */
function emriHazir(root: Root, bab: BabKey): string[] {
  const hamze = ALIF + (BABS[bab].muzari === DAMMA ? DAMMA : KASRA);
  // Each form opens with its prefix and the prefix's vowel: two code points.
  return muzariOf(root, bab, "malum", "meczum").map(
    (form) => hamze + form.slice(2)
  );
}

/**
 * The fourteen forms of a fiil kip, null where the kip has no sîga: the emr-i
 * gâib is said only to the absent, the emr-i hâzır only to the present.
 */
export function fiilOf(
  root: Root,
  bab: BabKey,
  kip: SigaKip,
  bina: Bina
): (string | null)[] {
  const forms = (): string[] => {
    switch (kip) {
      case "mazi":
        return maziOf(root, bab, bina);
      case "muzari":
        return muzariOf(root, bab, bina);
      case "cehdi_mutlak":
        return muzariOf(root, bab, bina, "meczum").map((f) => LEM + f);
      case "cehdi_mustagrak":
        return muzariOf(root, bab, bina, "meczum").map((f) => LEMMA + f);
      case "nefyi_hal":
        return muzariOf(root, bab, bina).map((f) => MA + f);
      case "nefyi_istikbal":
        return muzariOf(root, bab, bina).map((f) => LA + f);
      case "tekidi_nefyi_istikbal":
        return muzariOf(root, bab, bina, "mansub").map((f) => LEN + f);
      case "emri_gaib":
        return muzariOf(root, bab, bina, "meczum").map((f) => LI + f);
      case "nehyi_gaib":
      case "nehyi_hazir":
        return muzariOf(root, bab, bina, "meczum").map((f) => LA + f);
      case "emri_hazir":
        // The mechûl keeps its prefix and takes the lâm: لِتُنْصَرْ.
        return bina === "malum"
          ? emriHazir(root, bab)
          : muzariOf(root, bab, "mechul", "meczum").map((f) => LI + f);
      default:
        return [];
    }
  };
  return forms().map((form, i) => (slotApplies(kip, i) ? form : null));
}

/** The pronouns the first fi'l-i taaccüb ends with, in SLOTS order. */
const HA = "ه";
const KAF = "ك";
const BA = "ب";
/** هُنَّ, كُنَّ: the nûn doubled, its shadda before its vowel like every other. */
const UNNE = DAMMA + NUN + SHADDA + FATHA;

const TAACCUB_EVVEL: readonly string[] = [
  HA + DAMMA,
  HA + DAMMA + MIM + FATHA + ALIF,
  HA + DAMMA + MIM + SUKUN,
  HA + FATHA + ALIF,
  HA + DAMMA + MIM + FATHA + ALIF,
  HA + UNNE,
  KAF + FATHA,
  KAF + DAMMA + MIM + FATHA + ALIF,
  KAF + DAMMA + MIM + SUKUN,
  KAF + KASRA,
  KAF + DAMMA + MIM + FATHA + ALIF,
  KAF + UNNE,
  NUN + KASRA + YA,
  NUN + FATHA + ALIF,
];

/** The bâ and its pronoun, after the second fi'l-i taaccüb, in SLOTS order. */
const BI = BA + KASRA;
const TAACCUB_SANI: readonly string[] = [
  BI + HA + KASRA,
  BI + HA + KASRA + MIM + FATHA + ALIF,
  BI + HA + KASRA + MIM + SUKUN,
  BI + HA + FATHA + ALIF,
  BI + HA + KASRA + MIM + FATHA + ALIF,
  BI + HA + KASRA + NUN + SHADDA + FATHA,
  BI + KAF + FATHA,
  BI + KAF + DAMMA + MIM + FATHA + ALIF,
  BI + KAF + DAMMA + MIM + SUKUN,
  BI + KAF + KASRA,
  BI + KAF + DAMMA + MIM + FATHA + ALIF,
  BI + KAF + UNNE,
  BI + YA,
  BI + NUN + FATHA + ALIF,
];

/** مَا أَنْصَرَهُ … مَا أَنْصَرَنَا. */
export function taaccubEvvel([fa, ayn, lam]: Root): string[] {
  const stem = MA + HAMZA_ALIF + FATHA + fa + SUKUN + ayn + FATHA + lam + FATHA;
  return TAACCUB_EVVEL.map((pronoun) => stem + pronoun);
}

/** أَنْصِرْ بِهِ … أَنْصِرْ بِنَا. */
export function taaccubSani([fa, ayn, lam]: Root): string[] {
  const stem = `${HAMZA_ALIF}${FATHA}${fa}${SUKUN}${ayn}${KASRA}${lam}${SUKUN} `;
  return TAACCUB_SANI.map((pronoun) => stem + pronoun);
}
