import { MADRASAH_HANDLE_PATTERN } from "../../../src/madrasah/dto/create-madrasah.dto";
import {
  firstFreeHandle,
  handleFromName,
} from "../../../src/madrasah/madrasah-handle";

describe("handleFromName", () => {
  it.each([
    ["Atik Ali Paşa Medresesi", "atik-ali-pasa-medresesi"],
    ["Süleymaniye Medresesi", "suleymaniye-medresesi"],
    ["ÇEMBERLİTAŞ  Medresesi", "cemberlitas-medresesi"],
    ["Vefâ'da   İlim — Medresesi", "vefa-da-ilim-medresesi"],
    ["  --Zeyrek--  ", "zeyrek"],
    ["Medrese 2", "medrese-2"],
  ])("makes %j into %j", (name, expected) => {
    expect(handleFromName(name)).toBe(expected);
  });

  it.each([
    "",
    "   ",
    "!!!",
    "—",
    "ا",
  ])("falls back to a usable handle for %j, which has no letter to use", (name) => {
    expect(handleFromName(name)).toBe("medrese");
  });

  it("never exceeds 60 characters or ends in a hyphen, and always matches the handle pattern", () => {
    const long = `${"a".repeat(58)} bcd efg`;
    const handle = handleFromName(long);
    expect(handle.length).toBeLessThanOrEqual(60);
    expect(handle.endsWith("-")).toBe(false);
    expect(MADRASAH_HANDLE_PATTERN.test(handle)).toBe(true);
    expect(MADRASAH_HANDLE_PATTERN.test(handleFromName("x"))).toBe(true);
  });
});

describe("firstFreeHandle", () => {
  const takenSet = (...handles: string[]) => {
    const set = new Set(handles);
    return async (h: string) => set.has(h);
  };

  it("keeps a free handle as it is", async () => {
    expect(await firstFreeHandle("vefa", takenSet())).toBe("vefa");
  });

  it("numbers from 2 up to the first free one", async () => {
    expect(
      await firstFreeHandle("vefa", takenSet("vefa", "vefa-2", "vefa-3"))
    ).toBe("vefa-4");
  });

  it("keeps the numbered handle within 60 characters", async () => {
    const base = "a".repeat(60);
    const handle = await firstFreeHandle(base, takenSet(base));
    expect(handle).toBe(`${"a".repeat(58)}-2`);
    expect(MADRASAH_HANDLE_PATTERN.test(handle)).toBe(true);
  });
});
