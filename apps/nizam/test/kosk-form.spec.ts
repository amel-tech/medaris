import { resources } from "@medaris/i18n";
import { describe, expect, it } from "vitest";
import {
  addTag,
  clampHue,
  isKoskLevel,
  KOSK_FORM_LIMITS,
  KOSK_LEVELS,
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
  field: "",
  level: "",
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
      field: undefined,
      level: undefined,
      tags: [],
      coverHue: 215,
      isPrivate: true,
    });
  });

  it("sends an emptied field as null on edit, which is how the API clears it", () => {
    const dto = toKoskDto(state({ field: "  " }), "edit");
    expect(dto.field).toBeNull();
    expect(dto.level).toBeNull();
    expect(dto.handle).toBeNull();
    expect(dto.description).toBeNull();
  });

  it("sends the four form fields as typed", () => {
    expect(
      toKoskDto(
        state({
          field: " Fıkıh ",
          level: "ADVANCED",
          tags: ["Usûl"],
          coverHue: 30.4,
        }),
        "edit"
      )
    ).toMatchObject({
      field: "Fıkıh",
      level: "ADVANCED",
      tags: ["Usûl"],
      coverHue: 30,
    });
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

describe("clampHue / isKoskLevel", () => {
  it("keeps a hue a whole number of degrees in 0…360", () => {
    expect(clampHue(-5)).toBe(0);
    expect(clampHue(400)).toBe(360);
    expect(clampHue(12.6)).toBe(13);
    expect(clampHue(Number.NaN)).toBe(215);
  });

  it("knows the four levels tedrisat accepts", () => {
    expect(KOSK_LEVELS).toEqual([
      "ALL",
      "BEGINNER",
      "INTERMEDIATE",
      "ADVANCED",
    ]);
    expect(isKoskLevel("BEGINNER")).toBe(true);
    expect(isKoskLevel("EXPERT")).toBe(false);
    expect(isKoskLevel(null)).toBe(false);
  });
});

describe("köşk screen catalogue", () => {
  it.each([
    "KosksPage",
    "KoskDetail",
    "KoskForm",
    "Levels",
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

  it("labels every level the form offers", () => {
    for (const locale of ["tr", "en", "ar"] as const) {
      for (const level of KOSK_LEVELS) {
        expect(nizamCatalogue(locale).Levels?.[level]).toBeTruthy();
      }
    }
  });
});
