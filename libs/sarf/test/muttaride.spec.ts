import { describe, expect, it } from "vitest";
import {
  type Bina,
  cekim,
  cekimDrafts,
  hasMechul,
  kipTur,
  readSarf,
  SIGA_KIPS,
  type SigaKip,
  sigaRows,
} from "../src";

// Typed Arabic may order a shadda and its vowel either way: compare in NFC.
const nfc = (text: string) => text.normalize("NFC");

const NSR = readSarf({ root: "ن ص ر", bab: "nasara", mastar: "yardım etmek" });
if (!NSR) throw new Error("no sarf");

const table = (kip: SigaKip, bina: Bina = "malum") => {
  const found = cekim(NSR, kip, bina);
  if (!found) throw new Error(`no table for ${kip} ${bina}`);
  return found;
};

/** A table's Arabic, null where the kip has no sîga. */
const arabic = (kip: SigaKip, bina: Bina = "malum") =>
  table(kip, bina).hucreler.map((h) => (h ? nfc(h.arabic) : null));

const words = (text: string) => text.split("، ").map(nfc);
const none = (count: number) => Array.from({ length: count }, () => null);

describe("the Emsile-i Muttaride of نَصَرَ: the fiils", () => {
  it("the mâzî, ma'lûm and mechûl", () => {
    expect(arabic("mazi")).toEqual(
      words(
        "نَصَرَ، نَصَرَا، نَصَرُوا، نَصَرَتْ، نَصَرَتَا، نَصَرْنَ، نَصَرْتَ، نَصَرْتُمَا، نَصَرْتُمْ، نَصَرْتِ، نَصَرْتُمَا، نَصَرْتُنَّ، نَصَرْتُ، نَصَرْنَا"
      )
    );
    expect(arabic("mazi", "mechul")).toEqual(
      words(
        "نُصِرَ، نُصِرَا، نُصِرُوا، نُصِرَتْ، نُصِرَتَا، نُصِرْنَ، نُصِرْتَ، نُصِرْتُمَا، نُصِرْتُمْ، نُصِرْتِ، نُصِرْتُمَا، نُصِرْتُنَّ، نُصِرْتُ، نُصِرْنَا"
      )
    );
  });

  it("the muzâri, ma'lûm and mechûl", () => {
    expect(arabic("muzari")).toEqual(
      words(
        "يَنْصُرُ، يَنْصُرَانِ، يَنْصُرُونَ، تَنْصُرُ، تَنْصُرَانِ، يَنْصُرْنَ، تَنْصُرُ، تَنْصُرَانِ، تَنْصُرُونَ، تَنْصُرِينَ، تَنْصُرَانِ، تَنْصُرْنَ، أَنْصُرُ، نَنْصُرُ"
      )
    );
    expect(arabic("muzari", "mechul")).toEqual(
      words(
        "يُنْصَرُ، يُنْصَرَانِ، يُنْصَرُونَ، تُنْصَرُ، تُنْصَرَانِ، يُنْصَرْنَ، تُنْصَرُ، تُنْصَرَانِ، تُنْصَرُونَ، تُنْصَرِينَ، تُنْصَرَانِ، تُنْصَرْنَ، أُنْصَرُ، نُنْصَرُ"
      )
    );
  });

  it("the cehd-i mutlak: لَمْ and the meczûm, the nûn of i'râb dropped", () => {
    expect(arabic("cehdi_mutlak")).toEqual(
      words(
        "لَمْ يَنْصُرْ، لَمْ يَنْصُرَا، لَمْ يَنْصُرُوا، لَمْ تَنْصُرْ، لَمْ تَنْصُرَا، لَمْ يَنْصُرْنَ، لَمْ تَنْصُرْ، لَمْ تَنْصُرَا، لَمْ تَنْصُرُوا، لَمْ تَنْصُرِي، لَمْ تَنْصُرَا، لَمْ تَنْصُرْنَ، لَمْ أَنْصُرْ، لَمْ نَنْصُرْ"
      )
    );
    expect(arabic("cehdi_mutlak", "mechul").slice(0, 3)).toEqual(
      words("لَمْ يُنْصَرْ، لَمْ يُنْصَرَا، لَمْ يُنْصَرُوا")
    );
  });

  it("the cehd-i müstağrak: لَمَّا and the same meczûm", () => {
    expect(arabic("cehdi_mustagrak")).toEqual(
      arabic("cehdi_mutlak").map((form) =>
        form ? nfc(form.replace(nfc("لَمْ "), "لَمَّا ")) : null
      )
    );
    expect(arabic("cehdi_mustagrak")[0]).toBe(nfc("لَمَّا يَنْصُرْ"));
  });

  it("the nefy-i hâl and the nefy-i istikbâl: مَا and لَا before the merfû'", () => {
    expect(arabic("nefyi_hal")).toEqual(
      arabic("muzari").map((form) => nfc(`مَا ${form}`))
    );
    expect(arabic("nefyi_istikbal")).toEqual(
      arabic("muzari").map((form) => nfc(`لَا ${form}`))
    );
    expect(arabic("nefyi_istikbal", "mechul")[0]).toBe(nfc("لَا يُنْصَرُ"));
  });

  it("the te'kîd-i nefy-i istikbâl: لَنْ and the mansûb", () => {
    expect(arabic("tekidi_nefyi_istikbal")).toEqual(
      words(
        "لَنْ يَنْصُرَ، لَنْ يَنْصُرَا، لَنْ يَنْصُرُوا، لَنْ تَنْصُرَ، لَنْ تَنْصُرَا، لَنْ يَنْصُرْنَ، لَنْ تَنْصُرَ، لَنْ تَنْصُرَا، لَنْ تَنْصُرُوا، لَنْ تَنْصُرِي، لَنْ تَنْصُرَا، لَنْ تَنْصُرْنَ، لَنْ أَنْصُرَ، لَنْ نَنْصُرَ"
      )
    );
  });

  it("the emr-i gâib and the nehy-i gâib: six sîgas, to the absent", () => {
    expect(arabic("emri_gaib")).toEqual([
      ...words("لِيَنْصُرْ، لِيَنْصُرَا، لِيَنْصُرُوا، لِتَنْصُرْ، لِتَنْصُرَا، لِيَنْصُرْنَ"),
      ...none(8),
    ]);
    expect(arabic("emri_gaib", "mechul").slice(0, 6)).toEqual(
      words("لِيُنْصَرْ، لِيُنْصَرَا، لِيُنْصَرُوا، لِتُنْصَرْ، لِتُنْصَرَا، لِيُنْصَرْنَ")
    );
    expect(arabic("nehyi_gaib")).toEqual([
      ...words("لَا يَنْصُرْ، لَا يَنْصُرَا، لَا يَنْصُرُوا، لَا تَنْصُرْ، لَا تَنْصُرَا، لَا يَنْصُرْنَ"),
      ...none(8),
    ]);
  });

  it("the emr-i hâzır and the nehy-i hâzır: six sîgas, to the present", () => {
    expect(arabic("emri_hazir")).toEqual([
      ...none(6),
      ...words("اُنْصُرْ، اُنْصُرَا، اُنْصُرُوا، اُنْصُرِي، اُنْصُرَا، اُنْصُرْنَ"),
      ...none(2),
    ]);
    // The mechûl keeps its prefix and takes the lâm of the emir.
    expect(arabic("emri_hazir", "mechul").slice(6, 12)).toEqual(
      words("لِتُنْصَرْ، لِتُنْصَرَا، لِتُنْصَرُوا، لِتُنْصَرِي، لِتُنْصَرَا، لِتُنْصَرْنَ")
    );
    expect(arabic("nehyi_hazir").slice(6, 12)).toEqual(
      words("لَا تَنْصُرْ، لَا تَنْصُرَا، لَا تَنْصُرُوا، لَا تَنْصُرِي، لَا تَنْصُرَا، لَا تَنْصُرْنَ")
    );
    expect(arabic("nehyi_hazir", "mechul")[6]).toBe(nfc("لَا تُنْصَرْ"));
  });

  it("the two fi'l-i taaccübs, by the pronoun they end with", () => {
    expect(arabic("taaccub_evvel")).toEqual(
      words(
        "مَا أَنْصَرَهُ، مَا أَنْصَرَهُمَا، مَا أَنْصَرَهُمْ، مَا أَنْصَرَهَا، مَا أَنْصَرَهُمَا، مَا أَنْصَرَهُنَّ، مَا أَنْصَرَكَ، مَا أَنْصَرَكُمَا، مَا أَنْصَرَكُمْ، مَا أَنْصَرَكِ، مَا أَنْصَرَكُمَا، مَا أَنْصَرَكُنَّ، مَا أَنْصَرَنِي، مَا أَنْصَرَنَا"
      )
    );
    expect(arabic("taaccub_sani")).toEqual(
      words(
        "أَنْصِرْ بِهِ، أَنْصِرْ بِهِمَا، أَنْصِرْ بِهِمْ، أَنْصِرْ بِهَا، أَنْصِرْ بِهِمَا، أَنْصِرْ بِهِنَّ، أَنْصِرْ بِكَ، أَنْصِرْ بِكُمَا، أَنْصِرْ بِكُمْ، أَنْصِرْ بِكِ، أَنْصِرْ بِكُمَا، أَنْصِرْ بِكُنَّ، أَنْصِرْ بِي، أَنْصِرْ بِنَا"
      )
    );
    expect(cekim(NSR, "taaccub_evvel", "mechul")).toBeNull();
  });
});

describe("the Emsile-i Muttaride of نَصَرَ: the isims", () => {
  it("the ism-i fâil and the ism-i mef'ûl, with the plurals the book adds", () => {
    expect(arabic("ismi_fail")).toEqual(
      words("نَاصِرٌ، نَاصِرَانِ، نَاصِرُونَ، نَاصِرَةٌ، نَاصِرَتَانِ، نَاصِرَاتٌ")
    );
    expect(table("ismi_fail").ekler.map((ek) => nfc(ek.arabic))).toEqual(
      words("نَصَرَةٌ، نُصَّارٌ، نُصَّرٌ، نَوَاصِرُ")
    );
    expect(arabic("ismi_meful")).toEqual(
      words("مَنْصُورٌ، مَنْصُورَانِ، مَنْصُورُونَ، مَنْصُورَةٌ، مَنْصُورَتَانِ، مَنْصُورَاتٌ")
    );
    expect(table("ismi_meful").ekler.map((ek) => nfc(ek.arabic))).toEqual(
      words("مَنَاصِيرُ")
    );
    // A cem'-i mükesser is heard, not derived.
    expect(table("ismi_fail").ekler.every((ek) => ek.taslak)).toBe(true);
  });

  it("the masdars, in the nasb and with no müennes", () => {
    expect(arabic("masdar")).toEqual([
      ...words("نَصْرًا، نَصْرَيْنِ، نُصُورًا"),
      ...none(3),
    ]);
    expect(arabic("masdar_merre")).toEqual([
      ...words("نَصْرَةً، نَصْرَتَيْنِ، نَصَرَاتٍ"),
      ...none(3),
    ]);
    expect(arabic("masdar_nev")).toEqual([
      ...words("نِصْرَةً، نِصْرَتَيْنِ، نِصَرَاتٍ"),
      ...none(3),
    ]);
  });

  it("the isims in mîm gather on مَفَاعِلُ", () => {
    expect(arabic("ismi_zaman")).toEqual([
      ...words("مَنْصَرٌ، مَنْصَرَانِ، مَنَاصِرُ"),
      ...none(3),
    ]);
    expect(arabic("ismi_mekan")).toEqual(arabic("ismi_zaman"));
    expect(arabic("ismi_alet")).toEqual([
      ...words("مِنْصَرٌ، مِنْصَرَانِ، مَنَاصِرُ"),
      ...none(3),
    ]);
  });

  it("the tasğîr, the mensûb and the mübâlağa take the cem'-i sâlim", () => {
    expect(arabic("ismi_tasgir")).toEqual(
      words("نُصَيْرٌ، نُصَيْرَانِ، نُصَيْرُونَ، نُصَيْرَةٌ، نُصَيْرَتَانِ، نُصَيْرَاتٌ")
    );
    expect(arabic("ismi_mensub")).toEqual(
      words("نَصْرِيٌّ، نَصْرِيَّانِ، نَصْرِيُّونَ، نَصْرِيَّةٌ، نَصْرِيَّتَانِ، نَصْرِيَّاتٌ")
    );
    expect(arabic("mubalaga")).toEqual(
      words("نَصَّارٌ، نَصَّارَانِ، نَصَّارُونَ، نَصَّارَةٌ، نَصَّارَتَانِ، نَصَّارَاتٌ")
    );
  });

  it("the ism-i tafdîl: أَفْعَلُ and its müennes فُعْلَى", () => {
    expect(arabic("ismi_tafdil")).toEqual(
      words("أَنْصَرُ، أَنْصَرَانِ، أَنْصَرُونَ، نُصْرَى، نُصْرَيَانِ، نُصْرَيَاتٌ")
    );
    expect(table("ismi_tafdil").ekler.map((ek) => nfc(ek.arabic))).toEqual(
      words("أَنَاصِرُ، نُصَرٌ")
    );
  });

  it("an isim has no mechûl", () => {
    expect(cekim(NSR, "ismi_fail", "mechul")).toBeNull();
  });
});

describe("every table", () => {
  it("has a sîga exactly where its kip has a row for it", () => {
    for (const kip of SIGA_KIPS) {
      const hucreler = table(kip).hucreler;
      const isim = kipTur(kip) === "isim";
      expect(hucreler).toHaveLength(isim ? 6 : 14);
      const rows = sigaRows(kip);
      for (const hucre of hucreler) {
        if (!hucre) continue;
        expect(hucre.sahis === null).toBe(isim);
        if (isim) expect(rows).toContain(hucre.cinsiyet);
      }
      expect(hasMechul(kip)).toBe(cekim(NSR, kip, "mechul") !== null);
    }
  });

  it("glosses each fiil sîga with who acts, in that person", () => {
    const anlam = (kip: SigaKip, i: number, bina: Bina = "malum") =>
      table(kip, bina).hucreler[i]?.anlam;
    expect(anlam("mazi", 0)).toBe("O (erkek) yardım etti");
    expect(anlam("mazi", 2, "mechul")).toBe(
      "Onlar (erkekler) yardım olundular"
    );
    expect(anlam("muzari", 12)).toBe("Ben yardım ederim");
    expect(anlam("cehdi_mustagrak", 9)).toBe(
      "Sen (kadın) henüz yardım etmedin"
    );
    expect(anlam("nefyi_istikbal", 13)).toBe("Biz yardım etmeyiz");
    expect(anlam("tekidi_nefyi_istikbal", 12)).toBe(
      "Ben elbette yardım etmeyeceğim"
    );
    expect(anlam("emri_gaib", 2)).toBe("Onlar (erkekler) yardım etsinler");
    expect(anlam("emri_hazir", 8)).toBe("Siz (erkekler) yardım edin");
    expect(anlam("nehyi_hazir", 6)).toBe("Sen (erkek) yardım etme");
    expect(anlam("taaccub_evvel", 0)).toBe("O (erkek) ne acayip yardım etti");
  });

  it("glosses each isim sîga with whom it is said of, and how many", () => {
    const anlam = (kip: SigaKip, i: number) => table(kip).hucreler[i]?.anlam;
    expect(anlam("ismi_fail", 0)).toBe("yardım edici (erkek)");
    expect(anlam("ismi_fail", 5)).toBe("yardım ediciler (kadınlar)");
    expect(anlam("ismi_meful", 1)).toBe("yardım olunmuş (iki erkek)");
    expect(anlam("ismi_mekan", 1)).toBe("yardım edecek iki yer");
    expect(anlam("ismi_zaman", 2)).toBe("yardım edecek zamanlar");
    expect(anlam("masdar", 2)).toBe("yardım etmeler");
    expect(anlam("masdar_merre", 1)).toBe("iki kere yardım etmek");
    expect(anlam("masdar_nev", 0)).toBe("bir çeşit yardım etmek");
    expect(anlam("ismi_tafdil", 3)).toBe("daha çok yardım edici (kadın)");
  });

  it("marks a lâzım bâb's mechûl as a draft", () => {
    const hasune = readSarf({ root: "ح س ن", bab: "hasune" });
    if (!hasune) throw new Error("no sarf");
    expect(
      cekim(hasune, "mazi", "mechul")?.hucreler.every((h) => h?.taslak)
    ).toBe(true);
    expect(
      cekim(hasune, "mazi", "malum")?.hucreler.some((h) => h?.taslak)
    ).toBe(false);
  });

  it("merges a lâm that meets the suffix's own letter, in every kip", () => {
    const sarf = readSarf({ root: "س ك ن", bab: "nasara" });
    if (!sarf) throw new Error("no sarf");
    expect(nfc(cekim(sarf, "mazi")?.hucreler[5]?.arabic ?? "")).toBe(
      nfc("سَكَنَّ")
    );
    expect(nfc(cekim(sarf, "cehdi_mutlak")?.hucreler[5]?.arabic ?? "")).toBe(
      nfc("لَمْ يَسْكُنَّ")
    );
  });
});

describe("cekimDrafts", () => {
  it("drafts a table's sîgas as cards that carry their place", () => {
    const drafts = cekimDrafts(NSR, table("emri_hazir", "mechul"));
    expect(drafts).toHaveLength(6);
    expect(drafts[0]).toEqual({
      contentFront: table("emri_hazir", "mechul").hucreler[6]?.arabic,
      contentBack: "Sen (erkek) yardım olun",
      contentMeta: {
        kok: "ن ص ر",
        bab: "nasara",
        kip: "emri_hazir",
        bina: "mechul",
        sahis: "muhatab",
        cinsiyet: "muzekker",
        sayi: "mufred",
      },
    });
  });

  it("drafts an isim's extra plurals as free cards after its six", () => {
    const drafts = cekimDrafts(NSR, table("ismi_fail"));
    expect(drafts).toHaveLength(10);
    expect(drafts[3]?.contentMeta).toEqual({
      kok: "ن ص ر",
      bab: "nasara",
      kip: "ismi_fail",
      bina: "malum",
      sahis: null,
      cinsiyet: "muennes",
      sayi: "mufred",
    });
    expect(drafts.slice(6).every((d) => d.contentMeta === null)).toBe(true);
  });
});
