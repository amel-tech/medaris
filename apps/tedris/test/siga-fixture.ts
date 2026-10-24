import type { FlashcardResponse } from "@medaris/services/tedrisat";
import { cardRow } from "./decks-harness";

/**
 * نَصَرَ's fourteen mâzî sîgas as nazar-web's sîga generator writes them for
 * `yardım etti` (fronts, backs and `contentMeta`, MDRS-248), in a sarf book's order: gâib, gâibe, muhâtab,
 * muhâtaba, mütekellim; müfred, tesniye, cem across.
 */
const NASARA_MAZI: Array<[string, string, string, string | null, string]> = [
  ["نَصَرَ", "O (erkek) yardım etti", "gaib", "muzekker", "mufred"],
  ["نَصَرَا", "O ikisi (erkek) yardım etti", "gaib", "muzekker", "tesniye"],
  ["نَصَرُوا", "Onlar (erkekler) yardım ettiler", "gaib", "muzekker", "cem"],
  ["نَصَرَتْ", "O (kadın) yardım etti", "gaib", "muennes", "mufred"],
  ["نَصَرَتَا", "O ikisi (kadın) yardım etti", "gaib", "muennes", "tesniye"],
  ["نَصَرْنَ", "Onlar (kadınlar) yardım ettiler", "gaib", "muennes", "cem"],
  ["نَصَرْتَ", "Sen (erkek) yardım ettin", "muhatab", "muzekker", "mufred"],
  [
    "نَصَرْتُمَا",
    "Siz ikiniz (erkek) yardım ettiniz",
    "muhatab",
    "muzekker",
    "tesniye",
  ],
  ["نَصَرْتُمْ", "Siz (erkekler) yardım ettiniz", "muhatab", "muzekker", "cem"],
  ["نَصَرْتِ", "Sen (kadın) yardım ettin", "muhatab", "muennes", "mufred"],
  [
    "نَصَرْتُمَا",
    "Siz ikiniz (kadın) yardım ettiniz",
    "muhatab",
    "muennes",
    "tesniye",
  ],
  ["نَصَرْتُنَّ", "Siz (kadınlar) yardım ettiniz", "muhatab", "muennes", "cem"],
  ["نَصَرْتُ", "Ben yardım ettim", "mutekellim", null, "mufred"],
  ["نَصَرْنَا", "Biz yardım ettik", "mutekellim", null, "cem"],
];

export const nasaraMazi = (): FlashcardResponse[] =>
  NASARA_MAZI.map(([front, back, sahis, cinsiyet, sayi], i) =>
    cardRow(i + 1, undefined, {
      id: `s${i + 1}`,
      contentFront: front,
      contentBack: back,
      contentMeta: {
        kok: "ن ص ر",
        bab: "nasara",
        kip: "mazi",
        sahis,
        cinsiyet,
        sayi,
      },
    })
  );
