/**
 * A card's sîga, as its `contentMeta` carries it, and the laying out of a deck
 * as çekim tables.
 *
 * `contentMeta` is the contract between the müderris's generator (nazar-web
 * writes it) and the talebe's deck (tedris-web reads it): `{ kok, bab, kip,
 * bina, sahis, cinsiyet, sayi }`, every value a plain ASCII key. A card whose
 * meta does not read as a sîga is simply not part of a table.
 *
 * The first generator wrote only the mâzî and the muzâri of the ma'lûm and no
 * `bina`; such a card still reads, as ma'lûm.
 */

import {
  BINAS,
  type Bina,
  ISIM_ROWS,
  kipTur,
  SIGA_COLUMNS,
  SIGA_KIPS,
  type SigaCinsiyet,
  type SigaKip,
  type SigaRow,
  type SigaSahis,
  type SigaSayi,
  sigaRows,
  slotRow,
} from "./siga";

export interface SigaMeta {
  /** The root, as the müderris typed it (`ن ص ر`). */
  kok: string;
  /** The bâb key (`nasara`, `daraba`, …); shown only when it is known. */
  bab: string;
  kip: SigaKip;
  bina: Bina;
  /** Null for an isim, which is not conjugated by person. */
  sahis: SigaSahis | null;
  /** Null for the mütekellim, whose forms do not change with gender. */
  cinsiyet: SigaCinsiyet | null;
  sayi: SigaSayi;
}

const SAHIS: readonly SigaSahis[] = ["gaib", "muhatab", "mutekellim"];
const CINSIYET: readonly SigaCinsiyet[] = ["muzekker", "muennes"];

const isOneOf = <T extends string>(
  values: readonly T[],
  value: unknown
): value is T => typeof value === "string" && values.includes(value as T);

/** The row a sîga sits in, in its kip's table. */
export const sigaRow = (meta: SigaMeta): SigaRow => {
  if (meta.sahis === null)
    return meta.cinsiyet === "muennes" ? "muennes" : "muzekker";
  return slotRow({
    sahis: meta.sahis,
    cinsiyet: meta.cinsiyet,
    sayi: meta.sayi,
  });
};

/** A card's `contentMeta` read as a sîga, or null when it is not one. */
export const readSiga = (meta: unknown): SigaMeta | null => {
  if (typeof meta !== "object" || meta === null) return null;
  const m = meta as Record<string, unknown>;
  if (typeof m.kok !== "string" || m.kok.trim() === "") return null;
  if (!isOneOf(SIGA_KIPS, m.kip)) return null;
  if (!isOneOf(SIGA_COLUMNS, m.sayi)) return null;
  const bina = m.bina === undefined ? "malum" : m.bina;
  if (!isOneOf(BINAS, bina)) return null;
  const base = {
    kok: m.kok.trim(),
    bab: typeof m.bab === "string" ? m.bab : "",
    kip: m.kip,
    bina,
    sayi: m.sayi,
  };
  let read: SigaMeta;
  if (kipTur(m.kip) === "isim") {
    if (!isOneOf(CINSIYET, m.cinsiyet)) return null;
    read = { ...base, sahis: null, cinsiyet: m.cinsiyet };
  } else if (!isOneOf(SAHIS, m.sahis)) {
    return null;
  } else if (m.sahis === "mutekellim") {
    // The mütekellim has a singular (vahde) and one form for two or more
    // (maa'l-gayr, written as `cem`); there is no dual cell to put it in.
    if (m.sayi === "tesniye") return null;
    read = { ...base, sahis: m.sahis, cinsiyet: null };
  } else {
    if (!isOneOf(CINSIYET, m.cinsiyet)) return null;
    read = { ...base, sahis: m.sahis, cinsiyet: m.cinsiyet };
  }
  // A sîga its kip does not have (an emr-i hâzır of the gâib) is not one.
  return sigaRows(read.kip).includes(sigaRow(read)) ? read : null;
};

export interface SigaTable<T> {
  kok: string;
  bab: string;
  kip: SigaKip;
  bina: Bina;
  /** The rows this kip has, top to bottom. */
  rows: readonly SigaRow[];
  /** Every row, every column; null where the deck has no card for the cell. */
  cells: Partial<Record<SigaRow, Record<SigaSayi, T | null>>>;
}

export interface SigaLayout<T> {
  tables: SigaTable<T>[];
  /** The cards no table holds: no sîga, or a second card for a filled cell. */
  rest: T[];
}

const emptyCells = <T>(rows: readonly SigaRow[]): SigaTable<T>["cells"] =>
  Object.fromEntries(
    rows.map((row) => [
      row,
      { mufred: null, tesniye: null, cem: null } as Record<SigaSayi, T | null>,
    ])
  );

/**
 * The deck's cards laid out as çekim tables, in the order their roots first
 * appear and, for one root and bâb, in the Emsile's order of kips, the ma'lûm
 * before the mechûl. A deck with no sîga card gives no table and every card in
 * `rest`, which is the free grid.
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
      (t) =>
        t.kok === meta.kok &&
        t.bab === meta.bab &&
        t.kip === meta.kip &&
        t.bina === meta.bina
    );
    if (!table) {
      const rows = sigaRows(meta.kip);
      table = {
        kok: meta.kok,
        bab: meta.bab,
        kip: meta.kip,
        bina: meta.bina,
        rows,
        cells: emptyCells(rows),
      };
      tables.push(table);
    }
    const row = table.cells[sigaRow(meta)];
    if (row && row[meta.sayi] === null) row[meta.sayi] = card;
    else rest.push(card);
  }
  const rootOrder = tables.map((t) => `${t.kok}\u0000${t.bab}`);
  const rank = (t: SigaTable<T>) => rootOrder.indexOf(`${t.kok}\u0000${t.bab}`);
  tables.sort(
    (a, b) =>
      rank(a) - rank(b) ||
      SIGA_KIPS.indexOf(a.kip) - SIGA_KIPS.indexOf(b.kip) ||
      BINAS.indexOf(a.bina) - BINAS.indexOf(b.bina)
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
    table.rows.map((row) => [
      row,
      Object.fromEntries(
        SIGA_COLUMNS.map((column) => {
          const card = table.cells[row]?.[column] ?? null;
          const stays = card !== null && keep(card);
          if (stays) kept += 1;
          return [column, stays ? card : null];
        })
      ),
    ])
  ) as SigaTable<T>["cells"];
  return kept > 0 ? { ...table, cells } : null;
};

export { ISIM_ROWS };
