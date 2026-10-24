/**
 * The sîga table of the course page's card grid: when a deck's cards carry
 * their sîga in `contentMeta`, they are laid out the way a sarf book lays out a
 * çekim, one table per root, bâb and tense (kip), instead of a free grid.
 *
 * `contentMeta` is the contract the müderris's sîga generator in nazar-web
 * writes (MDRS-248): `{ kok, bab, kip, sahis, cinsiyet, sayi }`, every value a
 * plain ASCII key. The two apps cannot import each other, so each pins the same
 * literal keys in its own spec; a card whose meta does not read as a sîga is
 * simply not part of a table.
 *
 * Pure and generic over the card shape, so the spec pins every rule.
 */

export type SigaKip = "mazi" | "muzari";
export type SigaSahis = "gaib" | "muhatab" | "mutekellim";
export type SigaCinsiyet = "muzekker" | "muennes";
export type SigaSayi = "mufred" | "tesniye" | "cem";

export interface SigaMeta {
  /** The root, as the müderris typed it (`ن ص ر`). */
  kok: string;
  /** The bâb key (`nasara`, `daraba`, …); shown only when it is known. */
  bab: string;
  kip: SigaKip;
  sahis: SigaSahis;
  /** Null for the mütekellim, whose forms do not change with gender. */
  cinsiyet: SigaCinsiyet | null;
  sayi: SigaSayi;
}

/** The table's rows, top to bottom, as a sarf book orders them. */
export const SIGA_ROWS = [
  "gaib",
  "gaibe",
  "muhatab",
  "muhataba",
  "mutekellim",
] as const;
export type SigaRow = (typeof SIGA_ROWS)[number];

/** The table's columns, start to end. */
export const SIGA_COLUMNS = ["mufred", "tesniye", "cem"] as const;

const KIPS: readonly SigaKip[] = ["mazi", "muzari"];
const SAHIS: readonly SigaSahis[] = ["gaib", "muhatab", "mutekellim"];
const CINSIYET: readonly SigaCinsiyet[] = ["muzekker", "muennes"];

const isOneOf = <T extends string>(
  values: readonly T[],
  value: unknown
): value is T => typeof value === "string" && values.includes(value as T);

/** A card's `contentMeta` read as a sîga, or null when it is not one. */
export const readSiga = (meta: unknown): SigaMeta | null => {
  if (typeof meta !== "object" || meta === null) return null;
  const m = meta as Record<string, unknown>;
  if (typeof m.kok !== "string" || m.kok.trim() === "") return null;
  if (!isOneOf(KIPS, m.kip) || !isOneOf(SAHIS, m.sahis)) return null;
  if (!isOneOf(SIGA_COLUMNS, m.sayi)) return null;
  // The mütekellim has a singular (vahde) and one form for two or more
  // (maa'l-gayr, written as `cem`); there is no dual cell to put it in.
  if (m.sahis === "mutekellim") {
    if (m.sayi === "tesniye") return null;
    return {
      kok: m.kok.trim(),
      bab: typeof m.bab === "string" ? m.bab : "",
      kip: m.kip,
      sahis: m.sahis,
      cinsiyet: null,
      sayi: m.sayi,
    };
  }
  if (!isOneOf(CINSIYET, m.cinsiyet)) return null;
  return {
    kok: m.kok.trim(),
    bab: typeof m.bab === "string" ? m.bab : "",
    kip: m.kip,
    sahis: m.sahis,
    cinsiyet: m.cinsiyet,
    sayi: m.sayi,
  };
};

export const sigaRow = (meta: SigaMeta): SigaRow => {
  if (meta.sahis === "mutekellim") return "mutekellim";
  if (meta.sahis === "gaib")
    return meta.cinsiyet === "muennes" ? "gaibe" : "gaib";
  return meta.cinsiyet === "muennes" ? "muhataba" : "muhatab";
};

/** Whether a cell exists at all: the mütekellim has no dual. */
export const sigaCellApplies = (row: SigaRow, column: SigaSayi): boolean =>
  !(row === "mutekellim" && column === "tesniye");

export interface SigaTable<T> {
  kok: string;
  bab: string;
  kip: SigaKip;
  /** Every row, every column; null where the deck has no card for the cell. */
  cells: Record<SigaRow, Record<SigaSayi, T | null>>;
}

export interface SigaLayout<T> {
  tables: SigaTable<T>[];
  /** The cards no table holds: no sîga, or a second card for a filled cell. */
  rest: T[];
}

const emptyCells = <T>(): SigaTable<T>["cells"] =>
  Object.fromEntries(
    SIGA_ROWS.map((row) => [
      row,
      { mufred: null, tesniye: null, cem: null } as Record<SigaSayi, T | null>,
    ])
  ) as SigaTable<T>["cells"];

/**
 * The deck's cards laid out as sîga tables, in the order their roots first
 * appear and, for one root and bâb, the mâzî before the muzâri. A deck with no
 * sîga card gives no table and every card in `rest`, which is the free grid.
 */
export const sigaLayout = <T extends { contentMeta?: unknown }>(
  cards: readonly T[]
): SigaLayout<T> => {
  const tables: SigaTable<T>[] = [];
  const rest: T[] = [];
  for (const card of cards) {
    const meta = readSiga(card.contentMeta);
    if (!meta) {
      rest.push(card);
      continue;
    }
    let table = tables.find(
      (t) => t.kok === meta.kok && t.bab === meta.bab && t.kip === meta.kip
    );
    if (!table) {
      table = {
        kok: meta.kok,
        bab: meta.bab,
        kip: meta.kip,
        cells: emptyCells(),
      };
      tables.push(table);
    }
    const row = table.cells[sigaRow(meta)];
    if (row[meta.sayi] === null) row[meta.sayi] = card;
    else rest.push(card);
  }
  const rootOrder = tables.map((t) => `${t.kok}\u0000${t.bab}`);
  const rank = (t: SigaTable<T>) => rootOrder.indexOf(`${t.kok}\u0000${t.bab}`);
  tables.sort(
    (a, b) => rank(a) - rank(b) || KIPS.indexOf(a.kip) - KIPS.indexOf(b.kip)
  );
  return { tables, rest };
};

/**
 * A table with only the cards `keep` holds, the others' cells emptied; null
 * when it keeps none. "Kendini sına" draws a round of missed cards this way.
 */
export const narrowTable = <T>(
  table: SigaTable<T>,
  keep: (card: T) => boolean
): SigaTable<T> | null => {
  let kept = 0;
  const cells = Object.fromEntries(
    SIGA_ROWS.map((row) => [
      row,
      Object.fromEntries(
        SIGA_COLUMNS.map((column) => {
          const card = table.cells[row][column];
          const stays = card !== null && keep(card);
          if (stays) kept += 1;
          return [column, stays ? card : null];
        })
      ),
    ])
  ) as SigaTable<T>["cells"];
  return kept > 0 ? { ...table, cells } : null;
};

/**
 * The bâbs of the sülâsî mücerred, each as a sarf book names it: its model
 * verb in the mâzî and the muzâri. The generator writes these keys.
 */
export const BAB_NAMES: Record<string, string> = {
  nasara: "نَصَرَ يَنْصُرُ",
  daraba: "ضَرَبَ يَضْرِبُ",
  fataha: "فَتَحَ يَفْتَحُ",
  semia: "سَمِعَ يَسْمَعُ",
  hasune: "حَسُنَ يَحْسُنُ",
  hasibe: "حَسِبَ يَحْسِبُ",
};
