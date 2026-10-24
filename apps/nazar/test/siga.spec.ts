import { describe, expect, it } from "vitest";
import {
  BAB_KEYS,
  BABS,
  conjugateMeaning,
  generateSigas,
  mazi,
  muzari,
  readRoot,
  sigaDraftProblems,
} from "~/features/decks/siga";

// Letter by letter, each mark on its own: what a sarf book writes, spelled out
// so a misplaced haraka cannot hide inside a glyph.
const a = "َ"; // fatha
const u = "ُ"; // damma
const i = "ِ"; // kasra
const o = "ْ"; // sukun
const W = "ّ"; // shadda
const n = "ن";
const s = "ص";
const r = "ر";
const t = "ت";
const m = "م";
const w = "و";
const y = "ي";
const A = "ا";
const E = "أ"; // alif with hamza above
const NSR: [string, string, string] = [n, s, r];

const letters = (word: string) => Array.from(word);

describe("نَصَرَ's mâzî, letter by letter", () => {
  const expected = [
    [n, a, s, a, r, a], // نَصَرَ
    [n, a, s, a, r, a, A], // نَصَرَا
    [n, a, s, a, r, u, w, A], // نَصَرُوا
    [n, a, s, a, r, a, t, o], // نَصَرَتْ
    [n, a, s, a, r, a, t, a, A], // نَصَرَتَا
    [n, a, s, a, r, o, n, a], // نَصَرْنَ
    [n, a, s, a, r, o, t, a], // نَصَرْتَ
    [n, a, s, a, r, o, t, u, m, a, A], // نَصَرْتُمَا
    [n, a, s, a, r, o, t, u, m, o], // نَصَرْتُمْ
    [n, a, s, a, r, o, t, i], // نَصَرْتِ
    [n, a, s, a, r, o, t, u, m, a, A], // نَصَرْتُمَا
    [n, a, s, a, r, o, t, u, n, W, a], // نَصَرْتُنَّ
    [n, a, s, a, r, o, t, u], // نَصَرْتُ
    [n, a, s, a, r, o, n, a, A], // نَصَرْنَا
  ];

  it("has fourteen sîgas", () => {
    expect(mazi(NSR, "nasara")).toHaveLength(14);
  });

  expected.forEach((want, k) => {
    it(`sîga ${k + 1}`, () => {
      expect(letters(mazi(NSR, "nasara")[k])).toEqual(want);
    });
  });
});

describe("نَصَرَ's muzâri, letter by letter", () => {
  const stem = [n, o, s, u, r];
  const expected = [
    [y, a, ...stem, u], // يَنْصُرُ
    [y, a, ...stem, a, A, n, i], // يَنْصُرَانِ
    [y, a, ...stem, u, w, n, a], // يَنْصُرُونَ
    [t, a, ...stem, u], // تَنْصُرُ
    [t, a, ...stem, a, A, n, i], // تَنْصُرَانِ
    [y, a, ...stem, o, n, a], // يَنْصُرْنَ
    [t, a, ...stem, u], // تَنْصُرُ
    [t, a, ...stem, a, A, n, i], // تَنْصُرَانِ
    [t, a, ...stem, u, w, n, a], // تَنْصُرُونَ
    [t, a, ...stem, i, y, n, a], // تَنْصُرِينَ
    [t, a, ...stem, a, A, n, i], // تَنْصُرَانِ
    [t, a, ...stem, o, n, a], // تَنْصُرْنَ
    [E, a, ...stem, u], // أَنْصُرُ
    [n, a, ...stem, u], // نَنْصُرُ
  ];

  expected.forEach((want, k) => {
    it(`sîga ${k + 1}`, () => {
      expect(letters(muzari(NSR, "nasara")[k])).toEqual(want);
    });
  });
});

describe("each bâb", () => {
  const model: Record<string, string> = {
    nasara: "ن ص ر",
    daraba: "ض ر ب",
    fataha: "ف ت ح",
    semia: "س م ع",
    hasune: "ح س ن",
    hasibe: "ح س ب",
  };

  for (const bab of BAB_KEYS) {
    it(`${bab}: conjugates its own model verb as the bâb is named`, () => {
      const root = readRoot(model[bab]);
      if (!("letters" in root)) throw new Error(model[bab]);
      expect(
        `${mazi(root.letters, bab)[0]} ${muzari(root.letters, bab)[0]}`
      ).toBe(BABS[bab].name);
    });
  }

  it("daraba: kasra in the muzâri, fatha in the mâzî", () => {
    const root: [string, string, string] = ["ض", r, "ب"];
    expect(letters(mazi(root, "daraba")[12])).toEqual([
      "ض",
      a,
      r,
      a,
      "ب",
      o,
      t,
      u,
    ]); // ضَرَبْتُ
    expect(letters(muzari(root, "daraba")[9])).toEqual([
      t,
      a,
      "ض",
      o,
      r,
      i,
      "ب",
      i,
      y,
      n,
      a,
    ]); // تَضْرِبِينَ
  });

  it("fataha: fatha in both", () => {
    const root: [string, string, string] = ["ف", t, "ح"];
    expect(letters(muzari(root, "fataha")[2])).toEqual([
      y,
      a,
      "ف",
      o,
      t,
      a,
      "ح",
      u,
      w,
      n,
      a,
    ]); // يَفْتَحُونَ
  });

  it("semia: kasra in the mâzî, fatha in the muzâri", () => {
    const root: [string, string, string] = ["س", m, "ع"];
    expect(letters(mazi(root, "semia")[2])).toEqual([
      "س",
      a,
      m,
      i,
      "ع",
      u,
      w,
      A,
    ]); // سَمِعُوا
    expect(letters(muzari(root, "semia")[13])).toEqual([
      n,
      a,
      "س",
      o,
      m,
      a,
      "ع",
      u,
    ]); // نَسْمَعُ
  });

  it("hasune: damma in both", () => {
    const root: [string, string, string] = ["ح", "س", n];
    expect(letters(mazi(root, "hasune")[3])).toEqual([
      "ح",
      a,
      "س",
      u,
      n,
      a,
      t,
      o,
    ]); // حَسُنَتْ
    expect(letters(muzari(root, "hasune")[0])).toEqual([
      y,
      a,
      "ح",
      o,
      "س",
      u,
      n,
      u,
    ]); // يَحْسُنُ
  });

  it("hasibe: kasra in both", () => {
    const root: [string, string, string] = ["ح", "س", "ب"];
    expect(letters(mazi(root, "hasibe")[6])).toEqual([
      "ح",
      a,
      "س",
      i,
      "ب",
      o,
      t,
      a,
    ]); // حَسِبْتَ
    expect(letters(muzari(root, "hasibe")[12])).toEqual([
      E,
      a,
      "ح",
      o,
      "س",
      i,
      "ب",
      u,
    ]); // أَحْسِبُ
  });
});

describe("a lâm that meets the same letter", () => {
  const S = "\u0633";
  const K = "\u0643";
  const skn: [string, string, string] = [S, K, n];
  const skt: [string, string, string] = [S, K, t];

  it("merges nûn with nûn under a shadda: سَكَنَّ، سَكَنَّا، يَسْكُنَّ", () => {
    expect(letters(mazi(skn, "nasara")[5])).toEqual([S, a, K, a, n, W, a]);
    expect(letters(mazi(skn, "nasara")[13])).toEqual([S, a, K, a, n, W, a, A]);
    expect(letters(muzari(skn, "nasara")[5])).toEqual([
      y,
      a,
      S,
      o,
      K,
      u,
      n,
      W,
      a,
    ]);
  });

  it("merges tâ with tâ under a shadda: سَكَتُّ، سَكَتُّمْ", () => {
    expect(letters(mazi(skt, "nasara")[12])).toEqual([S, a, K, a, t, W, u]);
    expect(letters(mazi(skt, "nasara")[8])).toEqual([
      S,
      a,
      K,
      a,
      t,
      W,
      u,
      m,
      o,
    ]);
  });

  it("leaves every other ending alone", () => {
    expect(letters(mazi(skn, "nasara")[0])).toEqual([S, a, K, a, n, a]);
    expect(letters(mazi(skn, "nasara")[6])).toEqual([S, a, K, a, n, o, t, a]);
  });
});

describe("readRoot", () => {
  it("reads three letters with or without spaces, ignoring typed vowels", () => {
    expect(readRoot("ن ص ر")).toEqual({ letters: NSR });
    expect(readRoot("نصر")).toEqual({ letters: NSR });
    expect(readRoot(" نَصَرَ ")).toEqual({ letters: NSR });
  });

  it("names what is wrong with a root it cannot conjugate", () => {
    expect(readRoot("")).toEqual({ problem: "required" });
    expect(readRoot("  ")).toEqual({ problem: "required" });
    expect(readRoot("نص")).toEqual({ problem: "letters" });
    expect(readRoot("نصرف")).toEqual({ problem: "letters" });
    expect(readRoot("nsr")).toEqual({ problem: "letters" });
    expect(readRoot("قول")).toEqual({ problem: "weak" });
    expect(readRoot("أخذ")).toEqual({ problem: "weak" });
    expect(readRoot("رمي")).toEqual({ problem: "weak" });
    expect(readRoot("مدد")).toEqual({ problem: "doubled" });
  });
});

describe("conjugateMeaning", () => {
  it("turns a past in -dı/-tı to every person, with vowel harmony", () => {
    const etti = (p: Parameters<typeof conjugateMeaning>[1]) =>
      conjugateMeaning("yardım etti", p);
    expect(etti("3sg")).toBe("yardım etti");
    expect(etti("3pl")).toBe("yardım ettiler");
    expect(etti("2sg")).toBe("yardım ettin");
    expect(etti("2pl")).toBe("yardım ettiniz");
    expect(etti("1sg")).toBe("yardım ettim");
    expect(etti("1pl")).toBe("yardım ettik");
    expect(conjugateMeaning("yazdı", "2pl")).toBe("yazdınız");
    expect(conjugateMeaning("yazdı", "3pl")).toBe("yazdılar");
    expect(conjugateMeaning("okudu", "2pl")).toBe("okudunuz");
    expect(conjugateMeaning("gördü", "2pl")).toBe("gördünüz");
  });

  it("turns a present in -yor to every person", () => {
    expect(conjugateMeaning("yardım ediyor", "3pl")).toBe("yardım ediyorlar");
    expect(conjugateMeaning("yardım ediyor", "2sg")).toBe("yardım ediyorsun");
    expect(conjugateMeaning("yardım ediyor", "2pl")).toBe("yardım ediyorsunuz");
    expect(conjugateMeaning("yardım ediyor", "1sg")).toBe("yardım ediyorum");
    expect(conjugateMeaning("yardım ediyor", "1pl")).toBe("yardım ediyoruz");
  });

  it("keeps anything else as typed, and an empty meaning empty", () => {
    expect(conjugateMeaning("yardım", "2pl")).toBe("yardım");
    expect(conjugateMeaning("  ", "1sg")).toBe("");
  });
});

describe("generateSigas", () => {
  const request = {
    root: "ن ص ر",
    bab: "nasara" as const,
    kips: ["mazi", "muzari"] as const,
    maziMeaning: "yardım etti",
    muzariMeaning: "yardım ediyor",
  };

  it("drafts the fourteen mâzî then the fourteen muzâri", () => {
    const drafts = generateSigas(request);
    expect(drafts).toHaveLength(28);
    expect(drafts?.[0].contentFront).toBe("نَصَرَ");
    expect(drafts?.[14].contentFront).toBe("يَنْصُرُ");
  });

  it("writes the contract tedris-web reads, key for key", () => {
    const drafts = generateSigas(request) ?? [];
    expect(drafts[0].contentMeta).toEqual({
      kok: "ن ص ر",
      bab: "nasara",
      kip: "mazi",
      sahis: "gaib",
      cinsiyet: "muzekker",
      sayi: "mufred",
    });
    expect(drafts[13].contentMeta).toEqual({
      kok: "ن ص ر",
      bab: "nasara",
      kip: "mazi",
      sahis: "mutekellim",
      cinsiyet: null,
      sayi: "cem",
    });
    expect(drafts[24].contentMeta).toMatchObject({
      kip: "muzari",
      sahis: "muhatab",
      cinsiyet: "muennes",
      sayi: "tesniye",
    });
  });

  it("starts each back with who acts, then the meaning in that person", () => {
    const backs = (generateSigas(request) ?? []).map((d) => d.contentBack);
    expect(backs[0]).toBe("O (erkek) yardım etti");
    expect(backs[1]).toBe("O ikisi (erkek) yardım etti");
    expect(backs[5]).toBe("Onlar (kadınlar) yardım ettiler");
    expect(backs[8]).toBe("Siz (erkekler) yardım ettiniz");
    expect(backs[12]).toBe("Ben yardım ettim");
    expect(backs[13]).toBe("Biz yardım ettik");
    expect(backs[23]).toBe("Sen (kadın) yardım ediyorsun");
  });

  it("drafts only the tenses asked for, and an empty back with no meaning", () => {
    const only = generateSigas({
      ...request,
      kips: ["muzari"],
      muzariMeaning: "",
    });
    expect(only).toHaveLength(14);
    expect(only?.every((d) => d.contentMeta.kip === "muzari")).toBe(true);
    expect(only?.every((d) => d.contentBack === "")).toBe(true);
  });

  it("drafts nothing for a root it cannot conjugate", () => {
    expect(generateSigas({ ...request, root: "قول" })).toBeNull();
  });
});

describe("sigaDraftProblems", () => {
  it("names the drafts with a face shorter than 3 or longer than 5000", () => {
    const drafts =
      generateSigas({
        root: "ن ص ر",
        bab: "nasara",
        kips: ["mazi"],
        maziMeaning: "yardım etti",
        muzariMeaning: "",
      }) ?? [];
    expect(sigaDraftProblems(drafts)).toEqual([]);
    drafts[2] = { ...drafts[2], contentBack: "  " };
    drafts[5] = { ...drafts[5], contentFront: "x".repeat(5001) };
    expect(sigaDraftProblems(drafts)).toEqual([2, 5]);
  });
});
