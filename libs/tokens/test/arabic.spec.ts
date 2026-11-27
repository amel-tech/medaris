/**
 * MDRS-248 — the Arabic text standard tedris and nazar share: which text is
 * drawn as Arabic, and how large, against the tokens it names.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  ARABIC_LINE_HEIGHT,
  ARABIC_SCALE,
  ARABIC_TEXT_MIN_PX,
  arabicFontSize,
  arabicRuns,
  arabicTextProps,
  hasArabic,
  isMixed,
  mixedDir,
  startsArabic,
} from "../arabic.js";

const css = readFileSync(new URL("../medaris.css", import.meta.url), "utf8");
/** A token's default: its last declaration, the :root one (MDS-TOK-02). */
const token = (name: string) =>
  [...css.matchAll(new RegExp(`^\\s*${name}:\\s*([^;]+);`, "gm"))]
    .at(-1)?.[1]
    ?.trim();
const regionBlock = /html:lang\(ar\)[^{]*\{([^}]*)\}/.exec(css)?.[1] ?? "";

describe("the Arabic tokens (MDRS-248)", () => {
  it("are declared once in medaris.css with the values the module names", () => {
    expect(token("--arabic-scale")).toBe(String(ARABIC_SCALE));
    expect(token("--fs-arabic-text-min")).toBe(`${ARABIC_TEXT_MIN_PX}px`);
    expect(token("--lh-arabic-text")).toBe(String(ARABIC_LINE_HEIGHT));
    expect(token("--font-arabic")).toMatch(/^"Noto Naskh Arabic"/);
  });

  it("leaves an Arabic block's Latin size alone, and does not scale it inside an Arabic region", () => {
    expect(css).toContain(
      "html:lang(ar), :lang(ar):not([data-arabic-block]), :lang(ota-Arab) {"
    );
    expect(regionBlock).toMatch(/--arabic-scale:\s*1;/);
    expect(css).toMatch(
      /\[data-arabic-block\] \{ font-family: var\(--font-arabic\)/
    );
  });

  it("keeps Naskh's leading at or above the measured clip-safe 1.70", () => {
    expect(ARABIC_LINE_HEIGHT).toBeGreaterThanOrEqual(1.7);
  });
});

describe("startsArabic and hasArabic", () => {
  it("draws a text as Arabic when its first letter is Arabic", () => {
    expect(startsArabic("زَيْدٌ فِي الدَّارِ")).toBe(true);
    // Leading digits, marks and punctuation do not decide.
    expect(startsArabic("1. «قَالَ» ...")).toBe(true);
    expect(startsArabic("Aşağıdakilerden hangisi")).toBe(false);
    expect(startsArabic("")).toBe(false);
    expect(startsArabic("123 ?")).toBe(false);
  });

  it("finds Arabic anywhere in a mixed Turkish and Arabic text", () => {
    const mixed = "Aşağıdakilerden hangisi كَتَبَ fiilinin mazisidir?";
    expect(startsArabic(mixed)).toBe(false);
    expect(hasArabic(mixed)).toBe(true);
    expect(hasArabic("Kıyasın rükünleri")).toBe(false);
  });
});

describe("arabicFontSize", () => {
  it("multiplies the Latin size by the Arabic scale, floored at the minimum", () => {
    expect(arabicFontSize("var(--fs-body)")).toBe(
      "max(calc(var(--fs-arabic-text-min) * 1), calc(var(--fs-body) * var(--arabic-scale) * 1))"
    );
    expect(arabicFontSize()).toContain("calc(1em * var(--arabic-scale) * 1)");
  });

  it("puts A− / A+ on top of the Arabic scale, the minimum included", () => {
    expect(arabicFontSize("16px", 1.5)).toBe(
      "max(calc(var(--fs-arabic-text-min) * 1.5), calc(16px * var(--arabic-scale) * 1.5))"
    );
  });

  it("keeps Arabic the same ratio larger than Turkish at every step", () => {
    // The CSS above, evaluated with the token values.
    const px = (latin: number, scale: number) =>
      Math.max(ARABIC_TEXT_MIN_PX * scale, latin * ARABIC_SCALE * scale);
    for (const scale of [1, 1.15, 1.3, 1.5]) {
      expect(px(16, scale) / (16 * scale)).toBeCloseTo(ARABIC_SCALE);
      expect(px(14, scale) / (14 * scale)).toBeCloseTo(ARABIC_SCALE);
    }
    // A caption-sized Latin text is floored, never smaller than 18px.
    expect(px(12, 1)).toBe(ARABIC_TEXT_MIN_PX);
  });
});

describe("arabicTextProps", () => {
  it("gives Arabic its lang, dir, face, size, leading and isolation", () => {
    expect(arabicTextProps("زَيْدٌ", "var(--fs-body)", 1)).toEqual({
      lang: "ar",
      dir: "rtl",
      "data-arabic-block": "",
      style: {
        fontFamily: "var(--font-arabic)",
        fontSize: arabicFontSize("var(--fs-body)", 1),
        lineHeight: "var(--lh-arabic-text)",
        unicodeBidi: "isolate",
      },
    });
    expect(arabicTextProps("زَيْدٌ").style?.fontSize).toBe(arabicFontSize());
  });

  it("leaves a Latin text to the browser, with its size only when one is given", () => {
    expect(arabicTextProps("Kıyas")).toEqual({ dir: "auto" });
    expect(arabicTextProps("Kıyas", "var(--fs-body)", 1)).toEqual({
      dir: "auto",
      style: { fontSize: "var(--fs-body)" },
    });
    expect(arabicTextProps("Kıyas", "16px", 1.3)).toEqual({
      dir: "auto",
      style: { fontSize: "calc(16px * 1.3)" },
    });
    expect(arabicTextProps("Kıyas", undefined, 1.3)).toEqual({
      dir: "auto",
      style: { fontSize: "calc(1em * 1.3)" },
    });
  });
});

describe("arabicRuns", () => {
  it("cuts a mixed text into its runs and joins back to it", () => {
    const text = "Aşağıdakilerden hangisi كَتَبَ fiilinin mazisidir?";
    const runs = arabicRuns(text);
    expect(runs).toEqual([
      { text: "Aşağıdakilerden hangisi ", arabic: false },
      { text: "كَتَبَ", arabic: true },
      { text: " fiilinin mazisidir?", arabic: false },
    ]);
    expect(runs.map((r) => r.text).join("")).toBe(text);
  });

  it("keeps an Arabic phrase, its spaces and harakat, in one run", () => {
    expect(arabicRuns("زَيْدٌ فِي الدَّارِ")).toEqual([
      { text: "زَيْدٌ فِي الدَّارِ", arabic: true },
    ]);
    expect(arabicRuns("")).toEqual([]);
    // A long run of spaces closing an Arabic run moves on in linear time.
    const spaces = " ".repeat(50_000);
    expect(arabicRuns(`قَالَ${spaces}x`)).toEqual([
      { text: "قَالَ", arabic: true },
      { text: `${spaces}x`, arabic: false },
    ]);
    // Punctuation before any letter that opens no pair stays out of it.
    expect(arabicRuns("1. قَالَ")).toEqual([
      { text: "1. ", arabic: false },
      { text: "قَالَ", arabic: true },
    ]);
  });
});

describe("arabicRuns around brackets and quotes (MDRS-248)", () => {
  /** The runs, as [text, arabic] pairs, checked to join back to the text. */
  const cut = (text: string) => {
    const runs = arabicRuns(text);
    expect(runs.map((r) => r.text).join("")).toBe(text);
    return runs.map((r) => [r.text, r.arabic]);
  };

  it("keeps a verse in ﴿ ﴾ whole, the Turkish around it apart", () => {
    expect(
      cut("Fâtiha'daki ﴿اهْدِنَا الصِّرَاطَ الْمُسْتَقِيمَ﴾ ayetinin anlamı nedir?")
    ).toEqual([
      ["Fâtiha'daki ", false],
      ["﴿اهْدِنَا الصِّرَاطَ الْمُسْتَقِيمَ﴾", true],
      [" ayetinin anlamı nedir?", false],
    ]);
  });

  it("takes « » around an Arabic word into its run", () => {
    expect(cut("«زَيْدٌ» kelimesinin i'râbı nedir?")).toEqual([
      ["«زَيْدٌ»", true],
      [" kelimesinin i'râbı nedir?", false],
    ]);
  });

  it("keeps a hadith with its ﷺ, its colon and its quotes in one run, the dash with the Turkish", () => {
    expect(
      cut("قَالَ رَسُولُ اللَّهِ ﷺ: «إِنَّمَا الْأَعْمَالُ بِالنِّيَّاتِ» — bu hadisin konusu nedir?")
    ).toEqual([
      ["قَالَ رَسُولُ اللَّهِ ﷺ: «إِنَّمَا الْأَعْمَالُ بِالنِّيَّاتِ»", true],
      [" — bu hadisin konusu nedir?", false],
    ]);
  });

  it("takes ( ), [ ], ‹ ›, “ ” and straight quotes that touch it, spaces inside the pair included", () => {
    expect(cut("Kök (كَتَبَ) nedir?")).toEqual([
      ["Kök ", false],
      ["(كَتَبَ)", true],
      [" nedir?", false],
    ]);
    expect(cut("Bak: [ قَالَ ] ve ‹قِيلَ›")).toEqual([
      ["Bak: ", false],
      ["[ قَالَ ]", true],
      [" ve ", false],
      ["‹قِيلَ›", true],
    ]);
    expect(cut('Söz "قَالَ" ve “قِيلَ” mi?')).toEqual([
      ["Söz ", false],
      ['"قَالَ"', true],
      [" ve ", false],
      ["“قِيلَ”", true],
      [" mi?", false],
    ]);
  });

  it("leaves a straight quote or an apostrophe that does not touch the Arabic, or pairs with Turkish, to the Turkish", () => {
    expect(cut("Allah' ın اللَّهُ'ın")).toEqual([
      ["Allah' ın ", false],
      ["اللَّهُ", true],
      ["'ın", false],
    ]);
    expect(cut("' قَالَ'")).toEqual([
      ["' ", false],
      ["قَالَ", true],
      ["'", false],
    ]);
    // A pair opened in Turkish closes in Turkish.
    expect(cut("(Kur'an: قَالَ)")).toEqual([
      ["(Kur'an: ", false],
      ["قَالَ", true],
      [")", false],
    ]);
  });

  it("leaves Latin sentence punctuation after an Arabic run to the Turkish sentence", () => {
    expect(cut("Fiil: فَعَلَ?")).toEqual([
      ["Fiil: ", false],
      ["فَعَلَ", true],
      ["?", false],
    ]);
    // Two Arabic words with no Turkish between are one Arabic list.
    expect(cut("Örnek: «زَيْدٌ», «عَمْرٌو».")).toEqual([
      ["Örnek: ", false],
      ["«زَيْدٌ», «عَمْرٌو»", true],
      [".", false],
    ]);
  });

  it("closes nested pairs in order, and stops at a mark that closes nothing it opened", () => {
    expect(cut("Şu: («قَالَ») doğru mu?")).toEqual([
      ["Şu: ", false],
      ["(«قَالَ»)", true],
      [" doğru mu?", false],
    ]);
    expect(cut("«قَالَ) yanlış")).toEqual([
      ["«قَالَ", true],
      [") yanlış", false],
    ]);
  });

  it("keeps an Arabic-only text one run, whatever marks it holds", () => {
    expect(cut("«زَيْدٌ فِي الدَّارِ»")).toEqual([["«زَيْدٌ فِي الدَّارِ»", true]]);
    expect(cut("﴿الْحَمْدُ لِلَّهِ﴾")).toEqual([["﴿الْحَمْدُ لِلَّهِ﴾", true]]);
  });
});

describe("isMixed and mixedDir (MDRS-248)", () => {
  it("calls a text mixed only when it has Arabic and Latin letters", () => {
    expect(isMixed("«زَيْدٌ» kelimesinin i'râbı nedir?")).toBe(true);
    expect(isMixed("«زَيْدٌ فِي الدَّارِ»")).toBe(false);
    expect(isMixed("Kıyasın rükünleri")).toBe(false);
  });

  it("keeps a Turkish frame left to right whatever it quotes, and an Arabic one right to left", () => {
    expect(
      mixedDir(
        "قَالَ رَسُولُ اللَّهِ ﷺ: «إِنَّمَا الْأَعْمَالُ بِالنِّيَّاتِ» — bu hadisin konusu nedir?"
      )
    ).toBe("ltr");
    expect(mixedDir("Fiil: فَعَلَ")).toBe("ltr");
    // Mostly Arabic and ending in it, but a Turkish sentence all the same.
    expect(mixedDir("Doğru yol: ﴿الصِّرَاطَ الْمُسْتَقِيمَ﴾")).toBe("ltr");
    expect(mixedDir("مَا مَعْنَى X فِي الْآيَةِ؟")).toBe("rtl");
  });
});
