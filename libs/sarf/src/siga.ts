/**
 * The names a sîga goes by: its kip, its binâ and its place in a çekim.
 *
 * Every value is a plain ASCII key, because a card carries its sîga in
 * `contentMeta` and nazar-web (which writes it) and tedris-web (which lays a
 * deck out by it) both read the keys from here.
 */

/** The fourteen places of a fiil's çekim, as a person, a gender and a number. */
export type SigaSahis = "gaib" | "muhatab" | "mutekellim";
export type SigaCinsiyet = "muzekker" | "muennes";
export type SigaSayi = "mufred" | "tesniye" | "cem";
export type Bina = "malum" | "mechul";

export const BINAS: readonly Bina[] = ["malum", "mechul"];

/**
 * Every kip a çekim table can be of. The fi'l-i taaccüb is one line of the
 * Emsile-i Muhtelife but two sîgas, so it is two kips here.
 */
export const SIGA_KIPS = [
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
  "taaccub_evvel",
  "taaccub_sani",
] as const;
export type SigaKip = (typeof SIGA_KIPS)[number];

/** A fiil is conjugated by person; an isim by gender and number only. */
export type KipTur = "fiil" | "isim";

const ISIM_KIPS: ReadonlySet<SigaKip> = new Set([
  "masdar",
  "ismi_fail",
  "ismi_meful",
  "ismi_zaman",
  "ismi_mekan",
  "ismi_alet",
  "masdar_merre",
  "masdar_nev",
  "ismi_tasgir",
  "ismi_mensub",
  "mubalaga",
  "ismi_tafdil",
]);

export const kipTur = (kip: SigaKip): KipTur =>
  ISIM_KIPS.has(kip) ? "isim" : "fiil";

/** The fiil kips that have a mechûl beside their ma'lûm. */
const NO_MECHUL: ReadonlySet<SigaKip> = new Set([
  "taaccub_evvel",
  "taaccub_sani",
]);

export const hasMechul = (kip: SigaKip): boolean =>
  kipTur(kip) === "fiil" && !NO_MECHUL.has(kip);

export interface Slot {
  sahis: SigaSahis;
  /** Null for the mütekellim, whose forms do not change with gender. */
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

/** The six places of an isim's çekim, the müzekker first. */
export const ISIM_SLOTS: readonly {
  cinsiyet: SigaCinsiyet;
  sayi: SigaSayi;
}[] = [
  { cinsiyet: "muzekker", sayi: "mufred" },
  { cinsiyet: "muzekker", sayi: "tesniye" },
  { cinsiyet: "muzekker", sayi: "cem" },
  { cinsiyet: "muennes", sayi: "mufred" },
  { cinsiyet: "muennes", sayi: "tesniye" },
  { cinsiyet: "muennes", sayi: "cem" },
];

/** The rows of a çekim table, top to bottom, as a sarf book orders them. */
export const FIIL_ROWS = [
  "gaib",
  "gaibe",
  "muhatab",
  "muhataba",
  "mutekellim",
] as const;
export const ISIM_ROWS = ["muzekker", "muennes"] as const;
export type SigaRow = (typeof FIIL_ROWS)[number] | (typeof ISIM_ROWS)[number];

/** The columns of a çekim table, start to end. */
export const SIGA_COLUMNS = ["mufred", "tesniye", "cem"] as const;

/** The emir and the nehiy are said to the absent or to the present, not both. */
const GAIB_ONLY: ReadonlySet<SigaKip> = new Set(["emri_gaib", "nehyi_gaib"]);
const HAZIR_ONLY: ReadonlySet<SigaKip> = new Set(["emri_hazir", "nehyi_hazir"]);
/** The isims with no müennes of their own. */
const MUZEKKER_ONLY: ReadonlySet<SigaKip> = new Set([
  "masdar",
  "ismi_zaman",
  "ismi_mekan",
  "ismi_alet",
  "masdar_merre",
  "masdar_nev",
]);

/** The rows a kip's table has. */
export const sigaRows = (kip: SigaKip): readonly SigaRow[] => {
  if (kipTur(kip) === "isim")
    return MUZEKKER_ONLY.has(kip) ? ["muzekker"] : ISIM_ROWS;
  if (GAIB_ONLY.has(kip)) return ["gaib", "gaibe"];
  if (HAZIR_ONLY.has(kip)) return ["muhatab", "muhataba"];
  return FIIL_ROWS;
};

/** Whether a cell exists at all: the mütekellim has no dual. */
export const sigaCellApplies = (row: SigaRow, column: SigaSayi): boolean =>
  !(row === "mutekellim" && column === "tesniye");

/** The row a fiil's slot sits in. */
export const slotRow = (slot: Slot): SigaRow => {
  if (slot.sahis === "mutekellim") return "mutekellim";
  if (slot.sahis === "gaib")
    return slot.cinsiyet === "muennes" ? "gaibe" : "gaib";
  return slot.cinsiyet === "muennes" ? "muhataba" : "muhatab";
};

/** Whether a fiil kip has a sîga in a slot (index into SLOTS). */
export const slotApplies = (kip: SigaKip, index: number): boolean => {
  const slot = SLOTS[index];
  return slot !== undefined && sigaRows(kip).includes(slotRow(slot));
};
