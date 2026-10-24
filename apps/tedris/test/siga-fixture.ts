import type { FlashcardResponse } from "@medaris/services/tedrisat";
import { cardRow } from "./decks-harness";

/**
 * نَصَرَ's fourteen mâzî sîgas as the müderris's generator writes them
 * (`contentMeta`, MDRS-248), in a sarf book's order: gâib, gâibe, muhâtab,
 * muhâtaba, mütekellim; müfred, tesniye, cem across.
 */
const NASARA_MAZI: Array<[string, string, string, string | null, string]> = [
  ["نَصَرَ", "Yardım etti", "gaib", "muzekker", "mufred"],
  ["نَصَرَا", "İkisi yardım etti", "gaib", "muzekker", "tesniye"],
  ["نَصَرُوا", "Onlar yardım etti", "gaib", "muzekker", "cem"],
  ["نَصَرَتْ", "O (kadın) yardım etti", "gaib", "muennes", "mufred"],
  ["نَصَرَتَا", "İkisi (kadın) yardım etti", "gaib", "muennes", "tesniye"],
  ["نَصَرْنَ", "Onlar (kadınlar) yardım etti", "gaib", "muennes", "cem"],
  ["نَصَرْتَ", "Sen yardım ettin", "muhatab", "muzekker", "mufred"],
  ["نَصَرْتُمَا", "Siz ikiniz yardım ettiniz", "muhatab", "muzekker", "tesniye"],
  ["نَصَرْتُمْ", "Siz yardım ettiniz", "muhatab", "muzekker", "cem"],
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
