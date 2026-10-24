import { describe, expect, it } from "vitest";
import {
  narrowTable,
  readSiga,
  sigaCellApplies,
  sigaLayout,
  sigaRow,
} from "~/features/courses/siga-table";
import { nasaraMazi } from "./siga-fixture";

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
    expect(readSiga(meta())).toEqual(meta());
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
    const front = (
      row: keyof typeof table.cells,
      n: "mufred" | "tesniye" | "cem"
    ) => table.cells[row][n]?.contentFront ?? null;
    expect(front("gaib", "mufred")).toBe("نَصَرَ");
    expect(front("gaib", "cem")).toBe("نَصَرُوا");
    expect(front("gaibe", "cem")).toBe("نَصَرْنَ");
    expect(front("muhataba", "cem")).toBe("نَصَرْتُنَّ");
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
    expect(tables[0].cells.gaib.mufred).toBe(first);
    expect(rest).toEqual([twin, plain]);
  });
});

describe("narrowTable", () => {
  it("keeps only the cards asked for, and gives no table when none stays", () => {
    const [table] = sigaLayout(nasaraMazi()).tables;
    const narrowed = narrowTable(table, (card) => card.id === "s3");
    expect(narrowed?.cells.gaib.cem?.id).toBe("s3");
    expect(narrowed?.cells.gaib.mufred).toBeNull();
    expect(narrowed?.cells.mutekellim.cem).toBeNull();
    expect(narrowTable(table, () => false)).toBeNull();
  });
});
