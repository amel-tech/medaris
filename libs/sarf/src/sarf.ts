/**
 * The sarf of a root: the Emsile-i Muhtelife (the twenty-four sîgas one root
 * gives) and the Emsile-i Muttaride (the çekim of each of them).
 *
 * A root and its bâb are all it takes for the Arabic. The Turkish meaning
 * templates need the verb's mastar (`yardım etmek`); without one the Arabic is
 * still written and the meanings are left empty for the müderris.
 *
 * Scope: sülâsî mücerred, sâlim, the six bâbs. A root with a hamza or a weak
 * letter, or a doubled one, is refused (`readRoot`) rather than conjugated
 * wrongly.
 */

import { BABS, type BabKey, type MasdarVezin } from "./bab";
import { fiilOf, taaccubEvvel, taaccubSani } from "./fiil";
import { type Root, readRoot } from "./harf";
import { type IsimEk, isimOf } from "./isim";
import {
  type Bina,
  hasMechul,
  ISIM_SLOTS,
  kipTur,
  type SigaCinsiyet,
  type SigaKip,
  type SigaSahis,
  type SigaSayi,
  SLOTS,
} from "./siga";
import {
  cek,
  cogul,
  edecekOf,
  ediciOf,
  edilmisOf,
  type Fiil,
  mastarCogul,
  mastarOf,
  mastarYonelme,
  type Person,
  readMastar,
  type Zaman,
} from "./turkce";

export interface SarfRequest {
  /** The root as typed: `ن ص ر`, `نصر`. */
  root: string;
  bab: BabKey;
  /** The Turkish mastar the meanings are built on: `yardım etmek`. */
  mastar?: string;
  /** The masdar's vezin; the bâb's own model when left out. */
  masdar?: MasdarVezin;
}

/** A request read: what every sîga of the root is derived from. */
export interface Sarf {
  /** The root, its letters apart: `ن ص ر`. */
  kok: string;
  letters: Root;
  bab: BabKey;
  masdar: MasdarVezin;
  fiil: Fiil | null;
}

/** Null when the root cannot be conjugated here (`readRoot` says why). */
export function readSarf(request: SarfRequest): Sarf | null {
  const root = readRoot(request.root);
  if (!("letters" in root)) return null;
  return {
    kok: root.letters.join(" "),
    letters: root.letters,
    bab: request.bab,
    masdar: request.masdar ?? BABS[request.bab].masdar,
    fiil: request.mastar ? readMastar(request.mastar) : null,
  };
}

// ---- the meanings ----------------------------------------------------------------

/** Who acts, in Turkish, in SLOTS order: a meaning starts with it. */
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

/** The tense each fiil kip is glossed with, and the word that goes before it. */
const ZAMAN: Partial<Record<SigaKip, { zaman: Zaman; on?: string }>> = {
  mazi: { zaman: "gecmis" },
  muzari: { zaman: "genis" },
  cehdi_mutlak: { zaman: "olumsuzGecmis" },
  cehdi_mustagrak: { zaman: "olumsuzGecmis", on: "henüz " },
  nefyi_hal: { zaman: "olumsuzSimdiki" },
  nefyi_istikbal: { zaman: "olumsuzGenis" },
  tekidi_nefyi_istikbal: { zaman: "olumsuzGelecek", on: "elbette " },
  emri_gaib: { zaman: "emir" },
  nehyi_gaib: { zaman: "olumsuzEmir" },
  emri_hazir: { zaman: "emir" },
  nehyi_hazir: { zaman: "olumsuzEmir" },
  taaccub_evvel: { zaman: "gecmis", on: "ne acayip " },
  taaccub_sani: { zaman: "gecmis", on: "ne acayip " },
};

/** A fiil sîga's meaning without its person: "henüz yardım etmedi". */
function fiilAnlam(
  fiil: Fiil | null,
  kip: SigaKip,
  bina: Bina,
  person: Person
): string {
  const gloss = ZAMAN[kip];
  if (!fiil || !gloss) return "";
  return (gloss.on ?? "") + cek(fiil, gloss.zaman, person, bina === "mechul");
}

/** Whom an isim is said of, by gender and number. */
const KIM: Record<SigaCinsiyet, Record<SigaSayi, string>> = {
  muzekker: { mufred: "erkek", tesniye: "iki erkek", cem: "erkekler" },
  muennes: { mufred: "kadın", tesniye: "iki kadın", cem: "kadınlar" },
};

/** The count a masdar of once or of manner is glossed with. */
const KERE: Record<SigaSayi, string> = {
  mufred: "bir",
  tesniye: "iki",
  cem: "çok",
};

/** An isim sîga's meaning: "yardım ediciler (erkekler)". */
function isimAnlam(
  fiil: Fiil | null,
  kip: SigaKip,
  cinsiyet: SigaCinsiyet,
  sayi: SigaSayi
): string {
  if (!fiil) return "";
  const many = sayi === "cem";
  /** A describing word, said of someone: "çok yardım edici (iki erkek)". */
  const sifat = (word: string) =>
    `${many ? cogul(word) : word} (${KIM[cinsiyet][sayi]})`;
  /** A time, a place or a tool: "yardım edecek iki yer". */
  const nesne = (noun: string) => {
    const counted =
      sayi === "tesniye" ? `iki ${noun}` : many ? cogul(noun) : noun;
    return `${edecekOf(fiil)} ${counted}`;
  };
  switch (kip) {
    case "masdar":
      if (many) return mastarCogul(fiil);
      return sayi === "tesniye" ? `iki ${mastarOf(fiil)}` : mastarOf(fiil);
    case "masdar_merre":
      return `${KERE[sayi]} kere ${mastarOf(fiil)}`;
    case "masdar_nev":
      return `${KERE[sayi]} çeşit ${mastarOf(fiil)}`;
    case "ismi_fail":
      return sifat(ediciOf(fiil));
    case "ismi_meful":
      return sifat(edilmisOf(fiil));
    case "ismi_zaman":
      return nesne("zaman");
    case "ismi_mekan":
      return nesne("yer");
    case "ismi_alet":
      return nesne("alet");
    case "ismi_tasgir":
      return sifat(`azıcık ${ediciOf(fiil)}`);
    case "ismi_mensub":
      return sifat(`${mastarYonelme(fiil)} mensup`);
    case "mubalaga":
      return sifat(`çok ${ediciOf(fiil)}`);
    case "ismi_tafdil":
      return sifat(`daha çok ${ediciOf(fiil)}`);
    default:
      return "";
  }
}

// ---- the Emsile-i Muttaride: a kip's çekim ------------------------------------------

/** One sîga of a çekim table. */
export interface Hucre {
  arabic: string;
  /** The Turkish meaning template; empty when no mastar was given. */
  anlam: string;
  /** Suggested, not derived: the müderris confirms or corrects it. */
  taslak: boolean;
  /** Null in an isim's table. */
  sahis: SigaSahis | null;
  /** Null for the mütekellim, whose forms do not change with gender. */
  cinsiyet: SigaCinsiyet | null;
  sayi: SigaSayi;
}

export interface CekimTablosu {
  kip: SigaKip;
  bina: Bina;
  tur: "fiil" | "isim";
  /**
   * SLOTS order (fourteen) for a fiil, ISIM_SLOTS order (six) for an isim;
   * null where the kip has no sîga.
   */
  hucreler: (Hucre | null)[];
  /** The plurals an isim has beside its cem'-i sâlim. */
  ekler: (IsimEk & { anlam: string })[];
}

/** The çekim of one kip in one binâ; null when the kip has no such binâ. */
export function cekim(
  sarf: Sarf,
  kip: SigaKip,
  bina: Bina = "malum"
): CekimTablosu | null {
  const { letters, bab, fiil } = sarf;
  if (kipTur(kip) === "isim") {
    if (bina === "mechul") return null;
    const isim = isimOf(letters, bab, kip, sarf.masdar);
    if (!isim) return null;
    return {
      kip,
      bina,
      tur: "isim",
      hucreler: isim.forms.map((form, i) => {
        const slot = ISIM_SLOTS[i];
        if (!form || !slot) return null;
        return {
          ...form,
          anlam: isimAnlam(fiil, kip, slot.cinsiyet, slot.sayi),
          sahis: null,
          ...slot,
        };
      }),
      ekler: isim.ekler.map((ek) => ({
        ...ek,
        anlam: isimAnlam(fiil, kip, ek.cinsiyet, "cem"),
      })),
    };
  }
  if (bina === "mechul" && !hasMechul(kip)) return null;
  const forms =
    kip === "taaccub_evvel"
      ? taaccubEvvel(letters)
      : kip === "taaccub_sani"
        ? taaccubSani(letters)
        : fiilOf(letters, bab, kip, bina);
  // A lâzım fiil has a mechûl only with a harf-i cer (حُسِنَ بِهِ).
  const taslak = bina === "mechul" && BABS[bab].lazim;
  return {
    kip,
    bina,
    tur: "fiil",
    hucreler: forms.map((arabic, i) => {
      const slot = SLOTS[i];
      const person = PERSON[i];
      if (!arabic || !slot || !person) return null;
      const verb = fiilAnlam(fiil, kip, bina, person);
      return {
        arabic,
        anlam: verb ? `${WHO[i]} ${verb}` : "",
        taslak,
        ...slot,
      };
    }),
    ekler: [],
  };
}

// ---- the Emsile-i Muhtelife: the twenty-four ----------------------------------------

/** The twenty-four lines of the Emsile-i Muhtelife, in the book's order. */
export const MUHTELIFE = [
  "mazi",
  "muzari",
  "masdar",
  "ismi_fail",
  "ismi_meful",
  "cehdi_mutlak",
  "cehdi_mustagrak",
  "nefyi_hal",
  "nefyi_istikbal",
  "tekidi_nefyi_istikbal",
  "emri_gaib",
  "nehyi_gaib",
  "emri_hazir",
  "nehyi_hazir",
  "ismi_zaman",
  "ismi_mekan",
  "ismi_alet",
  "masdar_merre",
  "masdar_nev",
  "ismi_tasgir",
  "ismi_mensub",
  "mubalaga",
  "ismi_tafdil",
  "fiili_taaccub",
] as const;
export type MuhtelifeId = (typeof MUHTELIFE)[number];

/** The kips whose çekim a line of the twenty-four opens. */
export const muhtelifeKips = (id: MuhtelifeId): SigaKip[] =>
  id === "fiili_taaccub" ? ["taaccub_evvel", "taaccub_sani"] : [id];

/** What the Emsile says before a sîga: "so he is" a helper, "and that one" is helped. */
const ON_EK: Partial<Record<MuhtelifeId, string>> = {
  ismi_fail: "فَهُوَ",
  ismi_meful: "وَذَاكَ",
};

export interface MuhtelifeSatir {
  id: MuhtelifeId;
  /** 1 to 24. */
  sira: number;
  tur: "fiil" | "isim";
  /** The sîga as it heads its çekim; the taaccüb's two sîgas joined by وَ. */
  arabic: string;
  /** The word the Emsile puts before the sîga, when it does. */
  onEk: string | null;
  /** The Turkish meaning template, without a person; empty with no mastar. */
  anlam: string;
  taslak: boolean;
}

/** The meaning of a line of the twenty-four, as the Emsile glosses it. */
function muhtelifeAnlam(fiil: Fiil | null, id: MuhtelifeId): string {
  if (!fiil) return "";
  if (id === "fiili_taaccub")
    return fiilAnlam(fiil, "taaccub_evvel", "malum", "3sg");
  if (kipTur(id) === "fiil") {
    const person = id === "emri_hazir" || id === "nehyi_hazir" ? "2sg" : "3sg";
    return fiilAnlam(fiil, id, "malum", person);
  }
  // The isim's own gloss, without whom it is said of.
  return isimAnlam(fiil, id, "muzekker", "mufred").replace(/ \(erkek\)$/, "");
}

/** The twenty-four sîgas of a root, in the Emsile's order. */
export function muhtelife(sarf: Sarf): MuhtelifeSatir[] {
  return MUHTELIFE.map((id, i) => {
    const heads = muhtelifeKips(id).map((kip) => {
      const table = cekim(sarf, kip);
      return table?.hucreler.find((hucre) => hucre !== null) ?? null;
    });
    return {
      id,
      sira: i + 1,
      tur: id === "fiili_taaccub" ? "fiil" : kipTur(id),
      arabic: heads.map((head) => head?.arabic ?? "").join(" وَ"),
      onEk: ON_EK[id] ?? null,
      anlam: muhtelifeAnlam(sarf.fiil, id),
      taslak: heads.some((head) => head?.taslak ?? false),
    };
  });
}

/**
 * The twenty-four as the Emsile writes them, one sentence: نَصَرَ يَنْصُرُ
 * نَصْرًا فَهُوَ نَاصِرٌ وَذَاكَ مَنْصُورٌ …
 */
export const emsileMetni = (satirlar: readonly MuhtelifeSatir[]): string =>
  satirlar
    .map((satir) =>
      satir.onEk ? `${satir.onEk} ${satir.arabic}` : satir.arabic
    )
    .join(" ");
