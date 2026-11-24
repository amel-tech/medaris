/**
 * The six bâbs of the sülâsî mücerred, each by its model verb: the vowel of
 * the middle letter in the mâzî and in the muzâri.
 */

import { DAMMA, FATHA, KASRA, type Vowel } from "./harf";

/**
 * The masdar vezins the engine can write. The masdar of a sülâsî mücerred is
 * semâî: it is heard, not derived, so a vezin here is only ever a suggestion.
 */
export const MASDAR_VEZINS = [
  "fal",
  "feal",
  "ful",
  "fil",
  "fuul",
  "feale",
  "fuule",
  "fiale",
  "filan",
] as const;
export type MasdarVezin = (typeof MASDAR_VEZINS)[number];

/** Each masdar vezin as a sarf book names it, for a picker. */
export const MASDAR_VEZIN_NAMES: Record<MasdarVezin, string> = {
  fal: "فَعْلٌ",
  feal: "فَعَلٌ",
  ful: "فُعْلٌ",
  fil: "فِعْلٌ",
  fuul: "فُعُولٌ",
  feale: "فَعَالَةٌ",
  fuule: "فُعُولَةٌ",
  fiale: "فِعَالَةٌ",
  filan: "فِعْلَانٌ",
};

/**
 * `latin` names the bâb in a picker, whose options are plain text and cannot
 * set Arabic right. `masdar` is the vezin of the model verb's own masdar
 * (نَصْرًا, حُسْنًا, حِسْبَانًا), offered first for any root of the bâb.
 * `lazim` marks the bâb whose verbs take no object: its ism-i mef'ûl and its
 * mechûl exist only with a harf-i cer, so the engine marks them as drafts.
 */
export const BABS = {
  nasara: {
    mazi: FATHA,
    muzari: DAMMA,
    name: "نَصَرَ يَنْصُرُ",
    latin: "Nasara – yensuru",
    masdar: "fal",
    lazim: false,
  },
  daraba: {
    mazi: FATHA,
    muzari: KASRA,
    name: "ضَرَبَ يَضْرِبُ",
    latin: "Daraba – yadribu",
    masdar: "fal",
    lazim: false,
  },
  fataha: {
    mazi: FATHA,
    muzari: FATHA,
    name: "فَتَحَ يَفْتَحُ",
    latin: "Fetaha – yeftehu",
    masdar: "fal",
    lazim: false,
  },
  semia: {
    mazi: KASRA,
    muzari: FATHA,
    name: "سَمِعَ يَسْمَعُ",
    latin: "Semi'a – yesme'u",
    masdar: "fal",
    lazim: false,
  },
  hasune: {
    mazi: DAMMA,
    muzari: DAMMA,
    name: "حَسُنَ يَحْسُنُ",
    latin: "Hasune – yahsunu",
    masdar: "ful",
    lazim: true,
  },
  hasibe: {
    mazi: KASRA,
    muzari: KASRA,
    name: "حَسِبَ يَحْسِبُ",
    latin: "Hasibe – yahsibu",
    masdar: "filan",
    lazim: false,
  },
} as const satisfies Record<
  string,
  {
    mazi: Vowel;
    muzari: Vowel;
    name: string;
    latin: string;
    masdar: MasdarVezin;
    lazim: boolean;
  }
>;

export type BabKey = keyof typeof BABS;

export const BAB_KEYS = Object.keys(BABS) as BabKey[];

/** The bâbs by key, each as a sarf book names it. */
export const BAB_NAMES: Record<string, string> = Object.fromEntries(
  BAB_KEYS.map((key) => [key, BABS[key].name])
);

export const isBabKey = (value: unknown): value is BabKey =>
  typeof value === "string" && (BAB_KEYS as string[]).includes(value);
