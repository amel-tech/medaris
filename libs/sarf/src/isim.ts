/**
 * The isim sîgas of the sülâsî mücerred sâlim, each with its çekim: müfred,
 * tesniye and cem', müzekker then müennes, in ISIM_SLOTS order and null where
 * the isim has no such form.
 *
 * The i'râb is the Emsile's own: the masdars stand in the nasb (نَصْرًا), every
 * other isim in the ref' (نَاصِرٌ).
 *
 * `taslak` marks what the engine can only suggest. A masdar, an ism-i âlet and
 * a mübâlağa are semâî in the sülâsî mücerred (heard from the Arabs, not
 * derived), and so is every cem'-i mükesser; the vezin written is the most
 * common one and the müderris confirms or corrects it.
 */

import { BABS, type BabKey, type MasdarVezin } from "./bab";
import {
  ALIF,
  ALIF_MAKSURA,
  DAMMA,
  DAMMATAN,
  FATHA,
  FATHATAN,
  HAMZA_ALIF,
  KASRA,
  KASRATAN,
  MIM,
  NUN,
  type Root,
  SHADDA,
  SUKUN,
  TA,
  TA_MARBUTA,
  WAW,
  YA,
} from "./harf";
import type { SigaCinsiyet, SigaKip } from "./siga";

export interface IsimForm {
  arabic: string;
  taslak: boolean;
}

/** A form beside the six: a cem'-i mükesser the Emsile lists after the sâlim. */
export interface IsimEk extends IsimForm {
  cinsiyet: SigaCinsiyet;
}

export interface IsimCekim {
  /** ISIM_SLOTS order: three müzekker, three müennes. */
  forms: (IsimForm | null)[];
  ekler: IsimEk[];
}

const ANI = FATHA + ALIF + NUN + KASRA; // ـَانِ
const UNE = DAMMA + WAW + NUN + FATHA; // ـُونَ
const EYNI = FATHA + YA + SUKUN + NUN + KASRA; // ـَيْنِ

const kiyasi = (arabic: string): IsimForm => ({ arabic, taslak: false });
const semai = (arabic: string): IsimForm => ({ arabic, taslak: true });

/**
 * The six forms of an isim with a cem'-i sâlim, from its stem up to the last
 * letter (which carries the i'râb): نَاصِرٌ نَاصِرَانِ نَاصِرُونَ نَاصِرَةٌ
 * نَاصِرَتَانِ نَاصِرَاتٌ.
 */
const salim = (stem: string, taslak = false): IsimForm[] =>
  [
    stem + DAMMATAN,
    stem + ANI,
    stem + UNE,
    stem + FATHA + TA_MARBUTA + DAMMATAN,
    stem + FATHA + TA + ANI,
    stem + FATHA + ALIF + TA + DAMMATAN,
  ].map((arabic) => ({ arabic, taslak }));

/** A masdar vezin's stem, and whether it ends in a tâ marbûta. */
function masdarStem(
  [fa, ayn, lam]: Root,
  vezin: MasdarVezin
): { stem: string; marbuta: boolean } {
  switch (vezin) {
    case "fal":
      return { stem: fa + FATHA + ayn + SUKUN + lam, marbuta: false };
    case "feal":
      return { stem: fa + FATHA + ayn + FATHA + lam, marbuta: false };
    case "ful":
      return { stem: fa + DAMMA + ayn + SUKUN + lam, marbuta: false };
    case "fil":
      return { stem: fa + KASRA + ayn + SUKUN + lam, marbuta: false };
    case "fuul":
      return { stem: fa + DAMMA + ayn + DAMMA + WAW + lam, marbuta: false };
    case "feale":
      return { stem: fa + FATHA + ayn + FATHA + ALIF + lam, marbuta: true };
    case "fuule":
      return { stem: fa + DAMMA + ayn + DAMMA + WAW + lam, marbuta: true };
    case "fiale":
      return { stem: fa + KASRA + ayn + FATHA + ALIF + lam, marbuta: true };
    case "filan":
      return {
        stem: fa + KASRA + ayn + SUKUN + lam + FATHA + ALIF + NUN,
        marbuta: false,
      };
  }
}

/** A stem in the nasb, müfred and tesniye: نَصْرًا نَصْرَيْنِ, نَصْرَةً نَصْرَتَيْنِ. */
const mansub = (stem: string, marbuta: boolean): [string, string] =>
  marbuta
    ? [stem + FATHA + TA_MARBUTA + FATHATAN, stem + FATHA + TA + EYNI]
    : [stem + FATHATAN + ALIF, stem + EYNI];

function masdar(root: Root, vezin: MasdarVezin): IsimCekim {
  const [fa, ayn, lam] = root;
  const { stem, marbuta } = masdarStem(root, vezin);
  const [mufred, tesniye] = mansub(stem, marbuta);
  // Only the commonest vezin is given a plural, and the commonest one: فُعُولٌ.
  const cem =
    vezin === "fal"
      ? semai(fa + DAMMA + ayn + DAMMA + WAW + lam + FATHATAN + ALIF)
      : null;
  return {
    forms: [semai(mufred), semai(tesniye), cem, null, null, null],
    ekler: [],
  };
}

/** The masdar of once and the masdar of manner: نَصْرَةً and نِصْرَةً. */
function merre([fa, ayn, lam]: Root, first: string): IsimCekim {
  const stem = fa + first + ayn + SUKUN + lam;
  const [mufred, tesniye] = mansub(stem, true);
  const cem = fa + first + ayn + FATHA + lam + FATHA + ALIF + TA + KASRATAN;
  return {
    forms: [kiyasi(mufred), kiyasi(tesniye), kiyasi(cem), null, null, null],
    ekler: [],
  };
}

/**
 * The isims in mîm: the zaman and the mekân share مَفْعَلٌ (مَفْعِلٌ when the
 * ayn of the muzâri has a kesra), the âlet is مِفْعَلٌ; all three gather on
 * مَفَاعِلُ.
 */
function mimli(
  [fa, ayn, lam]: Root,
  mim: string,
  aynVowel: string,
  taslak: boolean
): IsimCekim {
  const stem = MIM + mim + fa + SUKUN + ayn + aynVowel + lam;
  const cem = MIM + FATHA + fa + FATHA + ALIF + ayn + KASRA + lam + DAMMA;
  const form = (arabic: string): IsimForm => ({ arabic, taslak });
  return {
    forms: [
      form(stem + DAMMATAN),
      form(stem + ANI),
      form(cem),
      null,
      null,
      null,
    ],
    ekler: [],
  };
}

/** The çekim of an isim kip, or null when the kip is a fiil's. */
export function isimOf(
  root: Root,
  bab: BabKey,
  kip: SigaKip,
  masdarVezin: MasdarVezin
): IsimCekim | null {
  const [fa, ayn, lam] = root;
  const { muzari, lazim } = BABS[bab];
  switch (kip) {
    case "masdar":
      return masdar(root, masdarVezin);
    case "ismi_fail":
      return {
        // A lâzım bâb describes with a sıfat-ı müşebbehe (حَسَنٌ) rather than
        // a fâil, so its فَاعِلٌ is offered as a draft.
        forms: salim(fa + FATHA + ALIF + ayn + KASRA + lam, lazim),
        ekler: [
          {
            ...semai(
              fa + FATHA + ayn + FATHA + lam + FATHA + TA_MARBUTA + DAMMATAN
            ),
            cinsiyet: "muzekker",
          },
          {
            ...semai(fa + DAMMA + ayn + SHADDA + FATHA + ALIF + lam + DAMMATAN),
            cinsiyet: "muzekker",
          },
          {
            ...semai(fa + DAMMA + ayn + SHADDA + FATHA + lam + DAMMATAN),
            cinsiyet: "muzekker",
          },
          {
            ...semai(
              fa + FATHA + WAW + FATHA + ALIF + ayn + KASRA + lam + DAMMA
            ),
            cinsiyet: "muennes",
          },
        ],
      };
    case "ismi_meful":
      return {
        forms: salim(MIM + FATHA + fa + SUKUN + ayn + DAMMA + WAW + lam, lazim),
        ekler: [
          {
            ...semai(
              MIM + FATHA + fa + FATHA + ALIF + ayn + KASRA + YA + lam + DAMMA
            ),
            cinsiyet: "muzekker",
          },
        ],
      };
    case "ismi_zaman":
    case "ismi_mekan":
      return mimli(root, FATHA, muzari === KASRA ? KASRA : FATHA, false);
    case "ismi_alet":
      return mimli(root, KASRA, FATHA, true);
    case "masdar_merre":
      return merre(root, FATHA);
    case "masdar_nev":
      return merre(root, KASRA);
    case "ismi_tasgir":
      return {
        forms: salim(fa + DAMMA + ayn + FATHA + YA + SUKUN + lam),
        ekler: [],
      };
    case "ismi_mensub":
      return {
        forms: salim(fa + FATHA + ayn + SUKUN + lam + KASRA + YA + SHADDA),
        ekler: [],
      };
    case "mubalaga":
      return {
        forms: salim(fa + FATHA + ayn + SHADDA + FATHA + ALIF + lam, true),
        ekler: [],
      };
    case "ismi_tafdil": {
      // أَفْعَلُ takes no tenvîn; its müennes is فُعْلَى.
      const muzekker = HAMZA_ALIF + FATHA + fa + SUKUN + ayn + FATHA + lam;
      const muennes = fa + DAMMA + ayn + SUKUN + lam + FATHA;
      return {
        forms: [
          kiyasi(muzekker + DAMMA),
          kiyasi(muzekker + ANI),
          kiyasi(muzekker + UNE),
          kiyasi(muennes + ALIF_MAKSURA),
          kiyasi(muennes + YA + ANI),
          kiyasi(muennes + YA + FATHA + ALIF + TA + DAMMATAN),
        ],
        ekler: [
          {
            ...semai(
              HAMZA_ALIF + FATHA + fa + FATHA + ALIF + ayn + KASRA + lam + DAMMA
            ),
            cinsiyet: "muzekker",
          },
          {
            ...semai(fa + DAMMA + ayn + FATHA + lam + DAMMATAN),
            cinsiyet: "muennes",
          },
        ],
      };
    }
    default:
      return null;
  }
}
