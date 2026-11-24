import { describe, expect, it } from "vitest";
import {
  cekim,
  cekimDrafts,
  generateSigas,
  narrowTable,
  readSarf,
  readSiga,
  type SigaRow,
  sigaCellApplies,
  sigaLayout,
  sigaRow,
} from "../src";

/** نَصَرَ's fourteen mâzî sîgas as the generator drafts them, with an id each. */
const nasaraMazi = () =>
  (
    generateSigas({
      root: "ن ص ر",
      bab: "nasara",
      kips: ["mazi"],
      maziMeaning: "yardım etti",
      muzariMeaning: "",
    }) ?? []
  ).map((draft, i) => ({ ...draft, id: `s${i + 1}` }));

const meta = (over: Record<string, unknown> = {}) => ({
  kok: "ن ص ر",
  bab: "nasara",
  kip: "mazi",
  sahis: "gaib",
  cinsiyet: "muzekker",
  sayi: "mufred",
  ...over,
});

describe("readSiga", () => {
  it("reads the generator's contract, key for key", () => {
    expect(readSiga(meta())).toEqual({ ...meta(), bina: "malum" });
  });

  it("refuses a meta that is not a sîga", () => {
    expect(readSiga(undefined)).toBeNull();
    expect(readSiga(null)).toBeNull();
    expect(readSiga("nasara")).toBeNull();
    expect(readSiga({})).toBeNull();
    expect(readSiga(meta({ kok: "  " }))).toBeNull();
    expect(readSiga(meta({ kip: "emir" }))).toBeNull();
    expect(readSiga(meta({ sahis: "third" }))).toBeNull();
    expect(readSiga(meta({ sayi: "plural" }))).toBeNull();
    expect(readSiga(meta({ cinsiyet: null }))).toBeNull();
  });

  it("reads the mütekellim without a gender, and refuses its dual", () => {
    expect(
      readSiga(meta({ sahis: "mutekellim", cinsiyet: "muennes" }))
    ).toMatchObject({ sahis: "mutekellim", cinsiyet: null });
    expect(
      readSiga(meta({ sahis: "mutekellim", cinsiyet: null, sayi: "tesniye" }))
    ).toBeNull();
  });

  it("keeps a missing bâb as empty rather than refusing the card", () => {
    const { bab: _bab, ...rest } = meta();
    expect(readSiga(rest)?.bab).toBe("");
  });
});

describe("sigaRow and sigaCellApplies", () => {
  it("puts person and gender in a sarf book's five rows", () => {
    const row = (over: Record<string, unknown>) => {
      const read = readSiga(meta(over));
      if (!read) throw new Error("not a sîga");
      return sigaRow(read);
    };
    expect(row({})).toBe("gaib");
    expect(row({ cinsiyet: "muennes" })).toBe("gaibe");
    expect(row({ sahis: "muhatab" })).toBe("muhatab");
    expect(row({ sahis: "muhatab", cinsiyet: "muennes" })).toBe("muhataba");
    expect(row({ sahis: "mutekellim", cinsiyet: null })).toBe("mutekellim");
  });

  it("has no dual cell for the mütekellim", () => {
    expect(sigaCellApplies("mutekellim", "tesniye")).toBe(false);
    expect(sigaCellApplies("mutekellim", "mufred")).toBe(true);
    expect(sigaCellApplies("gaib", "tesniye")).toBe(true);
  });
});

describe("sigaLayout", () => {
  it("lays نَصَرَ's fourteen mâzî sîgas out as one full table", () => {
    const { tables, rest } = sigaLayout(nasaraMazi());
    expect(rest).toEqual([]);
    expect(tables).toHaveLength(1);
    const [table] = tables;
    expect(table).toMatchObject({ kok: "ن ص ر", bab: "nasara", kip: "mazi" });
    // Typed Arabic may order a shadda and its vowel either way: compare in NFC.
    const front = (row: SigaRow, n: "mufred" | "tesniye" | "cem") =>
      table?.cells[row]?.[n]?.contentFront.normalize("NFC") ?? null;
    expect(front("gaib", "mufred")).toBe("نَصَرَ");
    expect(front("gaib", "cem")).toBe("نَصَرُوا");
    expect(front("gaibe", "cem")).toBe("نَصَرْنَ");
    expect(front("muhataba", "cem")).toBe("نَصَرْتُنَّ".normalize("NFC"));
    expect(front("mutekellim", "mufred")).toBe("نَصَرْتُ");
    expect(front("mutekellim", "tesniye")).toBeNull();
    expect(front("mutekellim", "cem")).toBe("نَصَرْنَا");
  });

  it("gives a deck with no sîga no table, every card for the free grid", () => {
    const cards = [{ id: "a" }, { id: "b", contentMeta: { note: "x" } }];
    expect(sigaLayout(cards)).toEqual({ tables: [], rest: cards });
  });

  it("puts the mâzî before the muzâri, roots in the order they first appear", () => {
    const card = (id: string, kok: string, kip: string) => ({
      id,
      contentMeta: meta({ kok, kip }),
    });
    const { tables } = sigaLayout([
      card("1", "ن ص ر", "muzari"),
      card("2", "ض ر ب", "mazi"),
      card("3", "ن ص ر", "mazi"),
    ]);
    expect(tables.map((t) => `${t.kok} ${t.kip}`)).toEqual([
      "ن ص ر mazi",
      "ن ص ر muzari",
      "ض ر ب mazi",
    ]);
  });

  it("sends a second card for a filled cell, and a non-sîga card, to the grid", () => {
    const first = { id: "1", contentMeta: meta() };
    const twin = { id: "2", contentMeta: meta() };
    const plain: { id: string; contentMeta?: unknown } = { id: "3" };
    const { tables, rest } = sigaLayout([first, twin, plain]);
    expect(tables[0]?.cells.gaib?.mufred).toBe(first);
    expect(rest).toEqual([twin, plain]);
  });
});

describe("narrowTable", () => {
  it("keeps only the cards asked for, and gives no table when none stays", () => {
    const [table] = sigaLayout(nasaraMazi()).tables;
    if (!table) throw new Error("no table");
    const narrowed = narrowTable(table, (card) => card.id === "s3");
    expect(narrowed?.cells.gaib?.cem?.id).toBe("s3");
    expect(narrowed?.cells.gaib?.mufred).toBeNull();
    expect(narrowed?.cells.mutekellim?.cem).toBeNull();
    expect(narrowTable(table, () => false)).toBeNull();
  });
});

describe("the kips beyond the mâzî and the muzâri", () => {
  it("reads the mechûl, and a card with no binâ as ma'lûm", () => {
    expect(readSiga(meta({ bina: "mechul" }))?.bina).toBe("mechul");
    expect(readSiga(meta())?.bina).toBe("malum");
    expect(readSiga(meta({ bina: "passive" }))).toBeNull();
  });

  it("reads an isim by gender and number, with no person", () => {
    expect(
      readSiga(meta({ kip: "ismi_fail", sahis: null, cinsiyet: "muennes" }))
    ).toMatchObject({ kip: "ismi_fail", sahis: null, cinsiyet: "muennes" });
    expect(
      readSiga(meta({ kip: "ismi_fail", sahis: null, cinsiyet: null }))
    ).toBeNull();
  });

  it("refuses a sîga its kip does not have", () => {
    expect(readSiga(meta({ kip: "emri_hazir" }))).toBeNull();
    expect(
      readSiga(meta({ kip: "emri_hazir", sahis: "muhatab" }))
    ).not.toBeNull();
    expect(readSiga(meta({ kip: "emri_gaib", sahis: "muhatab" }))).toBeNull();
    expect(
      readSiga(meta({ kip: "ismi_zaman", sahis: null, cinsiyet: "muennes" }))
    ).toBeNull();
  });

  it("lays a whole çekim's drafts out as one table of the kip's own rows", () => {
    const sarf = readSarf({ root: "ن ص ر", bab: "nasara" });
    if (!sarf) throw new Error("no sarf");
    for (const [kip, bina, rows] of [
      ["emri_hazir", "malum", ["muhatab", "muhataba"]],
      [
        "cehdi_mutlak",
        "mechul",
        ["gaib", "gaibe", "muhatab", "muhataba", "mutekellim"],
      ],
      ["ismi_fail", "malum", ["muzekker", "muennes"]],
      ["masdar_merre", "malum", ["muzekker"]],
    ] as const) {
      const table = cekim(sarf, kip, bina);
      if (!table) throw new Error(`no table for ${kip}`);
      const drafts = cekimDrafts(sarf, table);
      const { tables, rest } = sigaLayout(drafts);
      expect(tables).toHaveLength(1);
      expect(tables[0]).toMatchObject({ kip, bina, rows });
      // Only the plurals beside the table (cem'-i mükesser) stay free cards.
      expect(rest).toHaveLength(table.ekler.length);
    }
  });

  it("orders one root's tables as the Emsile does, ma'lûm before mechûl", () => {
    const card = (kip: string, bina: string) => ({
      contentMeta: meta({ kip, bina }),
    });
    const { tables } = sigaLayout([
      card("muzari", "mechul"),
      card("cehdi_mutlak", "malum"),
      card("muzari", "malum"),
      card("mazi", "mechul"),
    ]);
    expect(tables.map((t) => `${t.kip} ${t.bina}`)).toEqual([
      "mazi mechul",
      "muzari malum",
      "muzari mechul",
      "cehdi_mutlak malum",
    ]);
  });
});
