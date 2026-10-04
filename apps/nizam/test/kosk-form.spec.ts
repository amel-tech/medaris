import { resources } from "@medaris/i18n";
import { describe, expect, it } from "vitest";
import {
  addTag,
  clampHue,
  KOSK_FORM_LIMITS,
  type KoskFormState,
  toKoskDto,
} from "~/features/kosks/kosk-form";

type Catalogue = Record<string, Record<string, string>>;
const nizamCatalogue = (locale: "tr" | "en" | "ar"): Catalogue =>
  resources[locale].nizam as unknown as Catalogue;

const state = (overrides: Partial<KoskFormState> = {}): KoskFormState => ({
  name: "  Süleymaniye Köşkü ",
  handle: "",
  description: "",
  tags: [],
  coverHue: 215,
  isPrivate: true,
  ...overrides,
});

describe("toKoskDto (MDRS-108)", () => {
  it("leaves empty optional fields out of a create", () => {
    expect(toKoskDto(state(), "create")).toEqual({
      name: "Süleymaniye Köşkü",
      handle: undefined,
      description: undefined,
      tags: [],
      coverHue: 215,
      isPrivate: true,
    });
  });

  it("sends an emptied optional field as null on edit, which is how the API clears it", () => {
    const dto = toKoskDto(state({ handle: "  " }), "edit");
    expect(dto.handle).toBeNull();
    expect(dto.description).toBeNull();
  });

  it("sends the form fields as typed, and never the köşk's field or level (MDRS-252)", () => {
    const dto = toKoskDto(state({ tags: ["Usûl"], coverHue: 30.4 }), "edit");
    expect(dto).toMatchObject({ tags: ["Usûl"], coverHue: 30 });
    expect(dto).not.toHaveProperty("field");
    expect(dto).not.toHaveProperty("level");
    expect(toKoskDto(state(), "create")).not.toHaveProperty("field");
  });
});

describe("addTag", () => {
  it("adds a trimmed tag and ignores blanks and repeats", () => {
    expect(addTag([], "  Tefsir ")).toEqual({ ok: true, tags: ["Tefsir"] });
    expect(addTag(["Tefsir"], "   ")).toEqual({ ok: true, tags: ["Tefsir"] });
    // `tr-TR` lower-cases İ to i, so these are the same tag.
    expect(addTag(["İcazet"], "icazet")).toEqual({
      ok: true,
      tags: ["İcazet"],
    });
  });

  it("refuses an eleventh tag and one longer than forty characters", () => {
    const full = Array.from(
      { length: KOSK_FORM_LIMITS.tagsMax },
      (_, i) => `t${i}`
    );
    expect(addTag(full, "yeni")).toEqual({ ok: false, error: "tagsFull" });
    expect(addTag([], "x".repeat(KOSK_FORM_LIMITS.tagMax + 1))).toEqual({
      ok: false,
      error: "tagTooLong",
    });
  });
});

describe("clampHue", () => {
  it("keeps a hue a whole number of degrees in 0…360", () => {
    expect(clampHue(-5)).toBe(0);
    expect(clampHue(400)).toBe(360);
    expect(clampHue(12.6)).toBe(13);
    expect(clampHue(Number.NaN)).toBe(215);
  });
});

describe("köşk screen catalogue", () => {
  it.each([
    "KosksPage",
    "KoskDetail",
    "KoskForm",
  ])("%s has the same keys, all filled, in tr, en and ar", (ns) => {
    const keys = (locale: "tr" | "en" | "ar") =>
      Object.keys(nizamCatalogue(locale)[ns] ?? {}).sort();
    expect(keys("tr").length).toBeGreaterThan(0);
    expect(keys("en")).toEqual(keys("tr"));
    expect(keys("ar")).toEqual(keys("tr"));
    for (const locale of ["tr", "en", "ar"] as const) {
      for (const key of keys(locale)) {
        expect(nizamCatalogue(locale)[ns]?.[key]).toBeTruthy();
      }
    }
  });
});
