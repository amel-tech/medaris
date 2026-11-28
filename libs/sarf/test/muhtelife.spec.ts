import { describe, expect, it } from "vitest";
import {
  BAB_KEYS,
  type BabKey,
  emsileMetni,
  MUHTELIFE,
  type MuhtelifeId,
  muhtelife,
  readSarf,
} from "../src";

// Typed Arabic may order a shadda and its vowel either way: compare in NFC.
const nfc = (text: string) => text.normalize("NFC");

const of = (root: string, bab: BabKey, mastar?: string) => {
  const sarf = readSarf({ root, bab, mastar });
  if (!sarf) throw new Error(`no sarf for ${root}`);
  return muhtelife(sarf);
};

/**
 * The Emsile-i Muhtelife as the book writes it for نَصَرَ, sîga by sîga, each
 * with the meaning the book glosses it with.
 */
const NASARA: [MuhtelifeId, string, string][] = [
  ["mazi", "نَصَرَ", "yardım etti"],
  ["muzari", "يَنْصُرُ", "yardım eder"],
  ["masdar", "نَصْرًا", "yardım etmek"],
  ["ismi_fail", "نَاصِرٌ", "yardım edici"],
  ["ismi_meful", "مَنْصُورٌ", "yardım olunmuş"],
  ["cehdi_mutlak", "لَمْ يَنْصُرْ", "yardım etmedi"],
  ["cehdi_mustagrak", "لَمَّا يَنْصُرْ", "henüz yardım etmedi"],
  ["nefyi_hal", "مَا يَنْصُرُ", "yardım etmiyor"],
  ["nefyi_istikbal", "لَا يَنْصُرُ", "yardım etmez"],
  ["tekidi_nefyi_istikbal", "لَنْ يَنْصُرَ", "elbette yardım etmeyecek"],
  ["emri_gaib", "لِيَنْصُرْ", "yardım etsin"],
  ["nehyi_gaib", "لَا يَنْصُرْ", "yardım etmesin"],
  ["emri_hazir", "اُنْصُرْ", "yardım et"],
  ["nehyi_hazir", "لَا تَنْصُرْ", "yardım etme"],
  ["ismi_zaman", "مَنْصَرٌ", "yardım edecek zaman"],
  ["ismi_mekan", "مَنْصَرٌ", "yardım edecek yer"],
  ["ismi_alet", "مِنْصَرٌ", "yardım edecek alet"],
  ["masdar_merre", "نَصْرَةً", "bir kere yardım etmek"],
  ["masdar_nev", "نِصْرَةً", "bir çeşit yardım etmek"],
  ["ismi_tasgir", "نُصَيْرٌ", "azıcık yardım edici"],
  ["ismi_mensub", "نَصْرِيٌّ", "yardım etmeye mensup"],
  ["mubalaga", "نَصَّارٌ", "çok yardım edici"],
  ["ismi_tafdil", "أَنْصَرُ", "daha çok yardım edici"],
  ["fiili_taaccub", "مَا أَنْصَرَهُ وَأَنْصِرْ بِهِ", "ne acayip yardım etti"],
];

describe("the Emsile-i Muhtelife of نَصَرَ", () => {
  const satirlar = of("ن ص ر", "nasara", "yardım etmek");

  it("is the book's twenty-four, in the book's order", () => {
    expect(satirlar.map((satir) => satir.id)).toEqual([...MUHTELIFE]);
    expect(satirlar.map((satir) => satir.sira)).toEqual(
      Array.from({ length: 24 }, (_, i) => i + 1)
    );
    expect(NASARA.map(([id]) => id)).toEqual([...MUHTELIFE]);
  });

  NASARA.forEach(([id, arabic, anlam], i) => {
    it(`sîga ${i + 1}, ${id}: ${arabic}`, () => {
      expect(nfc(satirlar[i]?.arabic ?? "")).toBe(nfc(arabic));
      expect(satirlar[i]?.anlam).toBe(anlam);
    });
  });

  it("reads as the Emsile's own sentence, word for word", () => {
    expect(nfc(emsileMetni(satirlar))).toBe(
      nfc(
        "نَصَرَ يَنْصُرُ نَصْرًا فَهُوَ نَاصِرٌ وَذَاكَ مَنْصُورٌ لَمْ يَنْصُرْ لَمَّا يَنْصُرْ مَا يَنْصُرُ لَا يَنْصُرُ لَنْ يَنْصُرَ لِيَنْصُرْ لَا يَنْصُرْ اُنْصُرْ لَا تَنْصُرْ مَنْصَرٌ مَنْصَرٌ مِنْصَرٌ نَصْرَةً نِصْرَةً نُصَيْرٌ نَصْرِيٌّ نَصَّارٌ أَنْصَرُ مَا أَنْصَرَهُ وَأَنْصِرْ بِهِ"
      )
    );
  });

  it("writes every mark as its own code point, a shadda before its vowel", () => {
    // نَصَّارٌ: nûn, fatha, sâd, shadda, fatha, alif, râ, dammatân.
    expect(Array.from(satirlar[21]?.arabic ?? "")).toEqual([
      "ن",
      "َ",
      "ص",
      "ّ",
      "َ",
      "ا",
      "ر",
      "ٌ",
    ]);
  });

  it("marks what is semâî as a draft, and nothing else", () => {
    expect(
      satirlar.filter((satir) => satir.taslak).map((satir) => satir.id)
    ).toEqual(["masdar", "ismi_alet", "mubalaga"]);
  });

  it("calls the isims isim and the rest fiil", () => {
    expect(
      satirlar.filter((satir) => satir.tur === "isim").map((s) => s.sira)
    ).toEqual([3, 4, 5, 15, 16, 17, 18, 19, 20, 21, 22, 23]);
  });
});

describe("what changes with the bâb", () => {
  const sigas = (root: string, bab: BabKey) =>
    Object.fromEntries(of(root, bab).map((s) => [s.id, nfc(s.arabic)]));

  it("takes the ayn's vowels from the bâb", () => {
    expect(sigas("ض ر ب", "daraba")).toMatchObject({
      mazi: nfc("ضَرَبَ"),
      muzari: nfc("يَضْرِبُ"),
    });
    expect(sigas("ف ت ح", "fataha").muzari).toBe(nfc("يَفْتَحُ"));
    expect(sigas("س م ع", "semia")).toMatchObject({
      mazi: nfc("سَمِعَ"),
      muzari: nfc("يَسْمَعُ"),
    });
    expect(sigas("ح س ن", "hasune")).toMatchObject({
      mazi: nfc("حَسُنَ"),
      muzari: nfc("يَحْسُنُ"),
    });
    expect(sigas("ح س ب", "hasibe")).toMatchObject({
      mazi: nfc("حَسِبَ"),
      muzari: nfc("يَحْسِبُ"),
    });
  });

  it("gives the emr-i hâzır's hamze a damma only when the ayn has one", () => {
    expect(sigas("ن ص ر", "nasara").emri_hazir).toBe(nfc("اُنْصُرْ"));
    expect(sigas("ح س ن", "hasune").emri_hazir).toBe(nfc("اُحْسُنْ"));
    expect(sigas("ض ر ب", "daraba").emri_hazir).toBe(nfc("اِضْرِبْ"));
    expect(sigas("ف ت ح", "fataha").emri_hazir).toBe(nfc("اِفْتَحْ"));
    expect(sigas("س م ع", "semia").emri_hazir).toBe(nfc("اِسْمَعْ"));
    expect(sigas("ح س ب", "hasibe").emri_hazir).toBe(nfc("اِحْسِبْ"));
  });

  it("writes the ism-i zaman and mekân as مَفْعِلٌ when the muzâri's ayn has a kesra", () => {
    expect(sigas("ض ر ب", "daraba").ismi_zaman).toBe(nfc("مَضْرِبٌ"));
    expect(sigas("ح س ب", "hasibe").ismi_mekan).toBe(nfc("مَحْسِبٌ"));
    expect(sigas("ف ت ح", "fataha").ismi_zaman).toBe(nfc("مَفْتَحٌ"));
    expect(sigas("س م ع", "semia").ismi_mekan).toBe(nfc("مَسْمَعٌ"));
    // The âlet does not follow the bâb.
    expect(sigas("ض ر ب", "daraba").ismi_alet).toBe(nfc("مِضْرَبٌ"));
  });

  it("offers each bâb's model masdar first, and any vezin asked for", () => {
    expect(sigas("ض ر ب", "daraba").masdar).toBe(nfc("ضَرْبًا"));
    expect(sigas("ح س ن", "hasune").masdar).toBe(nfc("حُسْنًا"));
    expect(sigas("ح س ب", "hasibe").masdar).toBe(nfc("حِسْبَانًا"));
    const with_ = (masdar: Parameters<typeof readSarf>[0]["masdar"]) => {
      const sarf = readSarf({ root: "د خ ل", bab: "nasara", masdar });
      return nfc(muhtelife(sarf as NonNullable<typeof sarf>)[2]?.arabic ?? "");
    };
    expect(with_("fuul")).toBe(nfc("دُخُولًا"));
    expect(with_("feal")).toBe(nfc("دَخَلًا"));
    expect(with_("fil")).toBe(nfc("دِخْلًا"));
    expect(with_("feale")).toBe(nfc("دَخَالَةً"));
    expect(with_("fuule")).toBe(nfc("دُخُولَةً"));
    expect(with_("fiale")).toBe(nfc("دِخَالَةً"));
  });

  it("marks a lâzım bâb's fâil and mef'ûl as drafts too", () => {
    expect(
      of("ح س ن", "hasune")
        .filter((satir) => satir.taslak)
        .map((satir) => satir.id)
    ).toEqual(["masdar", "ismi_fail", "ismi_meful", "ismi_alet", "mubalaga"]);
  });

  it("gives twenty-four sîgas for every bâb", () => {
    for (const bab of BAB_KEYS) {
      const satirlar = of("ك ت ب", bab);
      expect(satirlar).toHaveLength(24);
      expect(satirlar.every((satir) => satir.arabic !== "")).toBe(true);
    }
  });
});

describe("the root and the mastar", () => {
  it("refuses a root that is not sâlim", () => {
    for (const root of ["قول", "أخذ", "مدّ", "وعد", "رمي", "نص"]) {
      expect(readSarf({ root, bab: "nasara" })).toBeNull();
    }
  });

  it("leaves every meaning empty without a mastar, and with one it cannot read", () => {
    expect(of("ن ص ر", "nasara").every((s) => s.anlam === "")).toBe(true);
    expect(of("ن ص ر", "nasara", "yardım").every((s) => s.anlam === "")).toBe(
      true
    );
  });

  it("keeps the root with its letters apart, however it was typed", () => {
    expect(readSarf({ root: "نَصَرَ", bab: "nasara" })?.kok).toBe("ن ص ر");
  });
});
