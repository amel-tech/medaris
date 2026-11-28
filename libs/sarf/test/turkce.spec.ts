import { describe, expect, it } from "vitest";
import { type BabKey, muhtelife, readMastar, readSarf } from "../src";
import { cek } from "../src/turkce";

const anlamlar = (mastar: string, bab: BabKey = "nasara") => {
  const sarf = readSarf({ root: "ك ت ب", bab, mastar });
  if (!sarf) throw new Error("no sarf");
  return Object.fromEntries(muhtelife(sarf).map((s) => [s.id, s.anlam]));
};

describe("readMastar", () => {
  it("reads the verb and the words before it", () => {
    expect(readMastar("yardım etmek")).toEqual({ on: "yardım ", kok: "et" });
    expect(readMastar("  Yazmak ")).toEqual({ on: "", kok: "yaz" });
    expect(readMastar("güzel  olmak")).toEqual({ on: "güzel ", kok: "ol" });
  });

  it("refuses what is not a mastar", () => {
    expect(readMastar("yardım")).toBeNull();
    expect(readMastar("")).toBeNull();
    expect(readMastar("mak")).toBeNull();
  });
});

describe("the meaning templates follow Turkish vowel harmony", () => {
  it("a back, unrounded stem: yazmak", () => {
    expect(anlamlar("yazmak")).toMatchObject({
      mazi: "yazdı",
      muzari: "yazar",
      masdar: "yazmak",
      ismi_fail: "yazıcı",
      ismi_meful: "yazılmış",
      cehdi_mutlak: "yazmadı",
      nefyi_hal: "yazmıyor",
      nefyi_istikbal: "yazmaz",
      tekidi_nefyi_istikbal: "elbette yazmayacak",
      emri_gaib: "yazsın",
      nehyi_gaib: "yazmasın",
      emri_hazir: "yaz",
      nehyi_hazir: "yazma",
      ismi_zaman: "yazacak zaman",
      ismi_mensub: "yazmaya mensup",
    });
  });

  it("a back, rounded stem whose aorist takes the high vowel: vurmak", () => {
    expect(anlamlar("vurmak")).toMatchObject({
      mazi: "vurdu",
      muzari: "vurur",
      ismi_fail: "vurucu",
      ismi_meful: "vurulmuş",
      nefyi_hal: "vurmuyor",
      emri_gaib: "vursun",
      ismi_alet: "vuracak alet",
    });
  });

  it("a front stem after a voiceless consonant: açmak, işitmek", () => {
    expect(anlamlar("açmak")).toMatchObject({
      mazi: "açtı",
      muzari: "açar",
      ismi_fail: "açıcı",
      ismi_meful: "açılmış",
    });
    expect(anlamlar("işitmek")).toMatchObject({
      mazi: "işitti",
      muzari: "işitir",
      ismi_fail: "işitici",
      ismi_meful: "işitilmiş",
      nefyi_hal: "işitmiyor",
    });
  });

  it("a stem in a vowel, and one in l: okumak, bilmek", () => {
    expect(anlamlar("okumak")).toMatchObject({
      mazi: "okudu",
      muzari: "okur",
      ismi_fail: "okuyucu",
      ismi_meful: "okunmuş",
      ismi_mekan: "okuyacak yer",
    });
    expect(anlamlar("bilmek")).toMatchObject({
      muzari: "bilir",
      ismi_meful: "bilinmiş",
    });
  });

  it("softens the t of etmek and gitmek, and glosses a compound's passive with olunmak", () => {
    expect(anlamlar("gitmek")).toMatchObject({
      muzari: "gider",
      ismi_fail: "gidici",
      ismi_zaman: "gidecek zaman",
    });
    expect(anlamlar("yardım etmek").ismi_meful).toBe("yardım olunmuş");
    expect(anlamlar("etmek").ismi_meful).toBe("edilmiş");
  });
});

describe("cek: every person of every tense", () => {
  const et = { on: "yardım ", kok: "et" };
  const all = (zaman: Parameters<typeof cek>[1], edilgen = false) =>
    (["3sg", "3pl", "2sg", "2pl", "1sg", "1pl"] as const).map((person) =>
      cek(et, zaman, person, edilgen).replace("yardım ", "")
    );

  it("the past and its negative", () => {
    expect(all("gecmis")).toEqual([
      "etti",
      "ettiler",
      "ettin",
      "ettiniz",
      "ettim",
      "ettik",
    ]);
    expect(all("olumsuzGecmis")).toEqual([
      "etmedi",
      "etmediler",
      "etmedin",
      "etmediniz",
      "etmedim",
      "etmedik",
    ]);
  });

  it("the aorist and its negative, which keeps its own persons", () => {
    expect(all("genis")).toEqual([
      "eder",
      "ederler",
      "edersin",
      "edersiniz",
      "ederim",
      "ederiz",
    ]);
    expect(all("olumsuzGenis")).toEqual([
      "etmez",
      "etmezler",
      "etmezsin",
      "etmezsiniz",
      "etmem",
      "etmeyiz",
    ]);
  });

  it("the negative present and future", () => {
    expect(all("olumsuzSimdiki")).toEqual([
      "etmiyor",
      "etmiyorlar",
      "etmiyorsun",
      "etmiyorsunuz",
      "etmiyorum",
      "etmiyoruz",
    ]);
    expect(all("olumsuzGelecek")).toEqual([
      "etmeyecek",
      "etmeyecekler",
      "etmeyeceksin",
      "etmeyeceksiniz",
      "etmeyeceğim",
      "etmeyeceğiz",
    ]);
  });

  it("the imperative, to the absent and to the present", () => {
    expect(all("emir").slice(0, 4)).toEqual([
      "etsin",
      "etsinler",
      "et",
      "edin",
    ]);
    expect(all("olumsuzEmir").slice(0, 4)).toEqual([
      "etmesin",
      "etmesinler",
      "etme",
      "etmeyin",
    ]);
    expect(cek({ on: "", kok: "oku" }, "emir", "2pl")).toBe("okuyun");
    expect(cek({ on: "", kok: "vur" }, "olumsuzEmir", "3pl")).toBe(
      "vurmasınlar"
    );
  });

  it("the passive", () => {
    expect(all("gecmis", true)).toEqual([
      "olundu",
      "olundular",
      "olundun",
      "olundunuz",
      "olundum",
      "olunduk",
    ]);
    expect(cek({ on: "", kok: "vur" }, "genis", "1pl", true)).toBe("vuruluruz");
  });
});
