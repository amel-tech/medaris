import { cekim, muhtelife, readSarf } from "@medaris/sarf";
import { describe, expect, it } from "vitest";
import {
  cekimCards,
  muhtelifeCards,
  sarfRootFacts,
} from "~/features/sarf/sarf";

const sarfOf = (mastar?: string) => {
  const sarf = readSarf({ root: "ن ص ر", bab: "nasara", mastar });
  if (!sarf) throw new Error("no sarf");
  return sarf;
};

describe("sarfRootFacts", () => {
  it("keeps the rows the engine knows, and leaves the others out", () => {
    const row = {
      id: "1",
      kok: "ن ص ر",
      bab: "nasara",
      mastar: "yardım etmek",
      masdarVezin: "fal",
    };
    expect(
      sarfRootFacts([
        row,
        { ...row, id: "2", bab: "kerume" },
        { ...row, id: "3", masdarVezin: "mefal" },
      ])
    ).toEqual([row]);
  });
});

describe("cekimCards", () => {
  it("makes a card of every sîga on show, each with its place", () => {
    const sarf = sarfOf("yardım etmek");
    const tables = [cekim(sarf, "mazi"), cekim(sarf, "mazi", "mechul")].flatMap(
      (table) => (table ? [table] : [])
    );
    const cards = cekimCards(sarf, tables, "VOCABULARY");
    expect(cards).toHaveLength(28);
    expect(cards?.[0]).toMatchObject({
      type: "VOCABULARY",
      contentBack: "O (erkek) yardım etti",
      contentMeta: { kip: "mazi", bina: "malum", sahis: "gaib" },
    });
    expect(cards?.[14]?.contentMeta).toMatchObject({ bina: "mechul" });
  });

  it("sends an extra plural as a free card, with no contentMeta key", () => {
    const sarf = sarfOf("yardım etmek");
    const table = cekim(sarf, "ismi_fail");
    const cards = cekimCards(sarf, table ? [table] : [], "VOCABULARY") ?? [];
    expect(cards).toHaveLength(10);
    expect("contentMeta" in (cards[9] ?? {})).toBe(false);
  });

  it("gives no cards when the backs would be empty", () => {
    const sarf = sarfOf();
    const table = cekim(sarf, "mazi");
    expect(cekimCards(sarf, table ? [table] : [], "VOCABULARY")).toBeNull();
  });
});

describe("muhtelifeCards", () => {
  const name = (id: string) => `<${id}>`;

  it("writes the sîga as the Emsile does, and names it on the back", () => {
    const cards =
      muhtelifeCards(muhtelife(sarfOf("yardım etmek")), name, "VOCABULARY") ??
      [];
    expect(cards).toHaveLength(24);
    expect(cards[0]?.contentBack).toBe("<mazi>: yardım etti");
    expect(cards[3]?.contentFront.startsWith("فَهُوَ ")).toBe(true);
    expect(cards.every((card) => !("contentMeta" in card))).toBe(true);
  });

  it("gives no cards without a mastar", () => {
    expect(muhtelifeCards(muhtelife(sarfOf()), name, "VOCABULARY")).toBeNull();
  });
});
