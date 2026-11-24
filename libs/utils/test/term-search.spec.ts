import { describe, expect, it } from "vitest";
import { findTerms, termSearchKey } from "../src/term-search";

const term = (
  name: string,
  over: Partial<{
    arabic: string;
    lexicalMeaning: string;
    technicalMeaning: string;
    example: string;
  }> = {}
) => ({
  term: name,
  arabic: over.arabic ?? null,
  lexicalMeaning: over.lexicalMeaning ?? null,
  technicalMeaning: over.technicalMeaning ?? null,
  example: over.example ?? null,
});

const TERMS = [
  term("Mâzî", {
    arabic: "الْمَاضِي",
    lexicalMeaning: "Geçmiş, geçen.",
    technicalMeaning: "Geçmiş zamanda bir işin yapıldığını bildiren fiil.",
    example: "نَصَرَ: yardım etti.",
  }),
  term("Sarf", { arabic: "الصَّرْف", lexicalMeaning: "Çevirmek." }),
  term("Istılah", { technicalMeaning: "Bir ilmin kendine has terimi." }),
  term("İsim"),
  term("Çekim"),
];

const names = (query: string, locale = "tr") =>
  findTerms(TERMS, query, locale).map((found) => found.term);

describe("termSearchKey", () => {
  it("lowers in the page's language: the Turkish İ and I", () => {
    expect(termSearchKey("ISTILAH", "tr")).toBe("ıstılah");
    expect(termSearchKey("İSİM", "tr")).toBe("isim");
  });

  it("drops a transliteration's circumflex and an Arabic word's vowel marks", () => {
    expect(termSearchKey("Mâzî", "tr")).toBe("mazi");
    expect(termSearchKey("Mef'ûl", "tr")).toBe("mef'ul");
    expect(termSearchKey("الْمَاضِي", "tr")).toBe("الماضي");
    expect(termSearchKey("الـمـاضي", "tr")).toBe("الماضي");
  });
});

describe("findTerms", () => {
  it("finds every term for an empty search, in the Turkish alphabet", () => {
    // ç after c, ı before i: Çekim, Istılah, İsim, Mâzî, Sarf.
    expect(names("")).toEqual(["Çekim", "Istılah", "İsim", "Mâzî", "Sarf"]);
    expect(names("   ")).toHaveLength(5);
  });

  it("finds a term typed without its circumflex, in any case", () => {
    expect(names("mazi")).toEqual(["Mâzî"]);
    expect(names("MÂZÎ")).toEqual(["Mâzî"]);
  });

  it("finds by the Arabic, vowelled or not", () => {
    expect(names("الماضي")).toEqual(["Mâzî"]);
    expect(names("الصَّرْف")).toEqual(["Sarf"]);
  });

  it("finds by either meaning and by the example", () => {
    expect(names("çevirmek")).toEqual(["Sarf"]);
    expect(names("terimi")).toEqual(["Istılah"]);
    expect(names("yardım")).toEqual(["Mâzî"]);
    expect(names("نصر")).toEqual(["Mâzî"]);
  });

  it("tells the Turkish ı from i", () => {
    expect(names("ıs")).toEqual(["Istılah"]);
    expect(names("is")).toEqual(["İsim"]);
  });

  it("finds nothing for what no term holds, and leaves the list as it was", () => {
    expect(names("nahiv")).toEqual([]);
    expect(TERMS[0]?.term).toBe("Mâzî");
  });
});
