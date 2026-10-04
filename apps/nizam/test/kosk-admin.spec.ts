import { resources } from "@medaris/i18n";
import { describe, expect, it } from "vitest";
import {
  addNazim,
  COVER_TONES,
  canOpen,
  DIRECTORY_PAGE_SIZE,
  directoryPath,
  emptyOpenForm,
  fieldOptions,
  filtersFromParams,
  handleLabel,
  isDirty,
  isNazimOf,
  KOSK_FIELDS,
  koskCase,
  koskErrorKey,
  nazimNames,
  openErrors,
  openPayload,
  pageCount,
  parseTags,
  settingsErrors,
  settingsFromKosk,
  settingsPayload,
  TONE_HUE,
  termLabel,
  toneOfHue,
  withFilter,
} from "~/features/kosks/admin-present";

/**
 * The pure rules behind Köşkler, Köşk aç, Köşk ayarları and Köşk nazımları
 * (MDRS-174, nizam 09, 10, 24, 25 and 21): the filters in the URL, how a nazım
 * list and a post's end read, the cover names, the forms' rules and payloads.
 */
describe("filters in the URL (nizam/09, criterion 2)", () => {
  it("reads every parameter, and treats anything unknown as unset", () => {
    expect(
      filtersFromParams({
        durum: "gizli",
        seviye: "baslangic",
        alan: "Hadis",
        gorunurluk: "listelenmeyen",
        q: "  bey ",
        sayfa: "3",
      })
    ).toEqual({
      status: "HIDDEN",
      level: "BEGINNER",
      field: "Hadis",
      listing: "UNLISTED",
      q: "bey",
      page: 3,
    });
    expect(
      filtersFromParams({ durum: "yok", seviye: "x", sayfa: "-4" })
    ).toEqual({
      status: "ALL",
      level: undefined,
      field: undefined,
      listing: "ALL",
      q: "",
      page: 1,
    });
  });

  it("writes them back, so a reload restores the same view", () => {
    const filters = filtersFromParams({
      durum: "etkin",
      seviye: "ileri",
      alan: "Fıkıh",
      gorunurluk: "listelenen",
      q: "fatih",
      sayfa: "2",
    });
    expect(filtersFromParams(urlParams(directoryPath(filters)))).toEqual(
      filters
    );
    expect(directoryPath(filtersFromParams({}))).toBe("/kosks");
  });

  it("starts the pages over when a filter changes", () => {
    const filters = filtersFromParams({ sayfa: "4" });
    expect(withFilter(filters, { status: "HIDDEN" }).page).toBe(1);
  });

  it("never asks for more rows than the API gives (12 a page)", () => {
    expect(DIRECTORY_PAGE_SIZE).toBe(12);
    expect(pageCount(0)).toBe(1);
    expect(pageCount(12)).toBe(1);
    expect(pageCount(13)).toBe(2);
  });
});

function urlParams(path: string) {
  const query = path.split("?")[1] ?? "";
  return Object.fromEntries(new URLSearchParams(query));
}

describe("nazım names and 'Siz' (nizam/09, criterion 4)", () => {
  const nazims = [
    { id: "a", name: "Ömer Nasuhi Bilmenoğlu", email: null },
    { id: "b", name: "Abdullah Nuri Gezginoğlu", email: null },
  ];

  it("joins two names with 've'", () => {
    expect(nazimNames(nazims, "tr", "?")).toBe(
      "Ömer Nasuhi Bilmenoğlu ve Abdullah Nuri Gezginoğlu"
    );
    expect(nazimNames(nazims.slice(0, 1), "tr", "?")).toBe(
      "Ömer Nasuhi Bilmenoğlu"
    );
    expect(nazimNames([], "tr", "?")).toBe("");
  });

  it("falls back to the e-mail, then to the unknown label", () => {
    expect(
      nazimNames([{ id: "c", name: null, email: "c@example.com" }], "tr", "?")
    ).toBe("c@example.com");
    expect(nazimNames([{ id: "c", name: null, email: null }], "tr", "?")).toBe(
      "?"
    );
  });

  it("knows the viewer by id, without case", () => {
    expect(isNazimOf(nazims, "A")).toBe(true);
    expect(isNazimOf(nazims, "z")).toBe(false);
    expect(isNazimOf(nazims, null)).toBe(false);
  });

  it("prints a short name with one @", () => {
    expect(handleLabel("beyazit")).toBe("@beyazit");
    expect(handleLabel("@fatih")).toBe("@fatih");
    expect(handleLabel(null)).toBeNull();
  });
});

describe("a post's end (nizam/25, criterion 3; nizam/21)", () => {
  const opts = {
    locale: "tr",
    timeZone: "Europe/Istanbul",
    unlimited: "Süresiz",
  };

  it("says 'Süresiz' for no end and the date otherwise", () => {
    expect(termLabel(null, opts)).toBe("Süresiz");
    expect(termLabel(undefined, opts)).toBe("Süresiz");
    expect(termLabel("2026-08-25T09:00:00Z", opts)).toBe("25 Ağustos 2026");
  });
});

describe("the cover (nizam/10, nizam/24)", () => {
  it("stores each name as its own hue, and reads the hue back as the same name", () => {
    for (const tone of COVER_TONES) {
      expect(toneOfHue(TONE_HUE[tone])).toBe(tone);
    }
  });

  it("gives an older köşk the name its hue looks most like", () => {
    // 215 is the default every köşk made before the names was given
    expect(toneOfHue(215)).toBe("laciverd");
    expect(toneOfHue(0)).toBe("bordo");
    expect(toneOfHue(359)).toBe("bordo");
    expect(toneOfHue(120)).toBe("zumrut");
    expect(toneOfHue(300)).toBe("murekkep");
  });
});

describe("tags (nizam/10, criterion 2)", () => {
  it("splits on commas and trims", () => {
    expect(parseTags("Akaid, Kelâm ,  Akaid-i Nesefî")).toEqual([
      "Akaid",
      "Kelâm",
      "Akaid-i Nesefî",
    ]);
  });

  it("drops blanks and repeats, without case", () => {
    expect(parseTags(" , Fıkıh,, fıkıh ,FIKIH")).toEqual(["Fıkıh"]);
    expect(parseTags("Iğdır, ığdır")).toEqual(["Iğdır"]);
    expect(parseTags("")).toEqual([]);
  });
});

describe("Köşk aç (nizam/10)", () => {
  const ready = () => ({
    ...emptyOpenForm(),
    name: "  Davutpaşa Köşkü ",
    handle: "@davutpasa",
    field: "Akaid ve kelâm",
    level: "BEGINNER" as const,
    tags: "Akaid, Kelâm",
    nazimIds: ["u1"],
  });

  it("keeps the button off until name, field, level and a nazım are right (criterion 1)", () => {
    expect(canOpen(emptyOpenForm())).toBe(false);
    expect(canOpen(ready())).toBe(true);
    expect(canOpen({ ...ready(), name: " " })).toBe(false);
    expect(canOpen({ ...ready(), field: "" })).toBe(false);
    expect(canOpen({ ...ready(), level: "" })).toBe(false);
    expect(canOpen({ ...ready(), nazimIds: [] })).toBe(false);
  });

  it("says what is wrong, field by field", () => {
    expect(openErrors(emptyOpenForm())).toMatchObject({
      name: "nameRequired",
      field: "fieldRequired",
      level: "levelRequired",
    });
    expect(openErrors({ ...ready(), name: "A" }).name).toBe("nameShort");
    expect(openErrors({ ...ready(), handle: "Davut Paşa" }).handle).toBe(
      "handleInvalid"
    );
    expect(openErrors({ ...ready(), handle: "" }).handle).toBeUndefined();
    expect(openErrors({ ...ready(), tags: "a,b,c,d,e,f,g,h,i,j,k" }).tags).toBe(
      "tagsFull"
    );
    expect(openErrors({ ...ready(), tags: "x".repeat(41) }).tags).toBe(
      "tagTooLong"
    );
  });

  it("sends tags as a list, the cover as a hue and the unlisted switch as isPrivate", () => {
    expect(openPayload({ ...ready(), tone: "zumrut", unlisted: true })).toEqual(
      {
        name: "Davutpaşa Köşkü",
        handle: "davutpasa",
        field: "Akaid ve kelâm",
        level: "BEGINNER",
        tags: ["Akaid", "Kelâm"],
        coverHue: TONE_HUE.zumrut,
        isPrivate: true,
        managerUserIds: ["u1"],
      }
    );
  });

  it("leaves an empty short name and description out", () => {
    const body = openPayload({ ...ready(), handle: "", description: "  " });
    expect(body).not.toHaveProperty("handle");
    expect(body).not.toHaveProperty("description");
    expect(
      openPayload({ ...ready(), description: " Akaid. " }).description
    ).toBe("Akaid.");
  });

  it("adds a person once (criterion 4)", () => {
    const list = [{ id: "A", name: "Ayşe" }];
    expect(addNazim(list, { id: "a", name: "Ayşe" })).toBe(list);
    expect(addNazim(list, { id: "b", name: "Ömer" })).toHaveLength(2);
  });

  it("offers the eleven fields of the design, and keeps an older köşk's own", () => {
    expect(KOSK_FIELDS).toHaveLength(11);
    expect(fieldOptions("Hadis")).toEqual(KOSK_FIELDS);
    expect(fieldOptions("Tefsir & Hadis")[0]).toBe("Tefsir & Hadis");
    expect(fieldOptions(null)).toEqual(KOSK_FIELDS);
  });
});

describe("Köşk ayarları (nizam/24)", () => {
  const kosk = {
    name: "Nûruosmaniye Köşkü",
    field: "Arapça dil ilimleri",
    level: "BEGINNER",
    tags: ["Sarf", "Nahiv"],
    coverHue: 250,
    description: "Arapça dil ilimlerinin köşkü.",
    isPrivate: false,
    alwaysRequireApproval: false,
    recordingsNeverPublic: false,
  };

  it("opens filled with the köşk's values (criterion 1)", () => {
    expect(settingsFromKosk(kosk)).toEqual({
      name: "Nûruosmaniye Köşkü",
      field: "Arapça dil ilimleri",
      level: "BEGINNER",
      tags: "Sarf, Nahiv",
      tone: "laciverd",
      description: "Arapça dil ilimlerinin köşkü.",
      unlisted: false,
      alwaysRequireApproval: false,
      recordingsNeverPublic: false,
    });
  });

  it("is clean until something changes, and sends only what changed", () => {
    const form = settingsFromKosk(kosk);
    expect(isDirty(form, kosk)).toBe(false);
    expect(settingsPayload(form, kosk)).toEqual({});
    expect(
      settingsPayload(
        { ...form, name: " Yeni Ad ", unlisted: true, tone: "bordo" },
        kosk
      )
    ).toEqual({ name: "Yeni Ad", isPrivate: true, coverHue: TONE_HUE.bordo });
  });

  it("sends the two policies, and clears an emptied description with null", () => {
    const form = settingsFromKosk(kosk);
    expect(
      settingsPayload(
        {
          ...form,
          alwaysRequireApproval: true,
          recordingsNeverPublic: true,
          description: "  ",
        },
        kosk
      )
    ).toEqual({
      alwaysRequireApproval: true,
      recordingsNeverPublic: true,
      description: null,
    });
  });

  it("does not repaint an older köşk that is saved with its cover untouched", () => {
    const old = { ...kosk, coverHue: 215 };
    const form = settingsFromKosk(old);
    expect(settingsPayload({ ...form, name: "Başka" }, old)).toEqual({
      name: "Başka",
    });
  });

  it("refuses an empty name and says so (criterion 2)", () => {
    const form = settingsFromKosk(kosk);
    expect(settingsErrors(form)).toEqual({});
    expect(settingsErrors({ ...form, name: "  " }).name).toBe("nameRequired");
    expect(settingsErrors({ ...form, field: "" }).field).toBe("fieldRequired");
    expect(isDirty({ ...form, name: "" }, kosk)).toBe(true);
  });

  it("shows a level the lists do not know as not chosen", () => {
    expect(settingsFromKosk({ ...kosk, level: "EXPERT" }).level).toBe("");
    expect(settingsFromKosk({ ...kosk, level: undefined }).level).toBe("");
  });
});

describe("köşk names in Turkish case endings", () => {
  it("takes the genitive and the accusative by how the name ends", () => {
    expect(koskCase("Nûruosmaniye Köşkü", "tr", "genitive")).toBe(
      "Nûruosmaniye Köşkü’nün"
    );
    expect(koskCase("Nûruosmaniye Köşkü", "tr", "accusative")).toBe(
      "Nûruosmaniye Köşkü’nü"
    );
    expect(koskCase("Beyazıt Köşk", "tr", "genitive")).toBe("Beyazıt Köşk’ün");
    expect(koskCase("Beyazıt", "tr", "accusative")).toBe("Beyazıt köşkünü");
    expect(koskCase("Beyazıt Köşkü", "en", "genitive")).toBe("Beyazıt Köşkü");
  });
});

describe("refusals", () => {
  it("maps each code to its message, and the rest to the generic one", () => {
    expect(koskErrorKey({ code: "KOSK_HANDLE_TAKEN" })).toBe(
      "errors.handleTaken"
    );
    expect(koskErrorKey({ code: "KOSK_NAZIM_EXISTS" })).toBe(
      "errors.nazimExists"
    );
    expect(koskErrorKey({ code: "GRANT_EXPIRY_INVALID" })).toBe(
      "errors.endPast"
    );
    expect(koskErrorKey({ code: "AUTHZ_FORBIDDEN" })).toBe("errors.forbidden");
    // A restore by a lower level than the one that hid it (MDRS-143).
    expect(koskErrorKey({ code: "ARCHIVE_RESTORE_LEVEL" })).toBe(
      "errors.restoreLevel"
    );
    expect(koskErrorKey({ code: "SOMETHING" })).toBe("errors.generic");
    expect(koskErrorKey(undefined)).toBe("errors.generic");
  });
});

describe("the catalogue", () => {
  type Tree = Record<string, unknown>;
  const flat = (node: unknown, prefix = ""): string[] =>
    node && typeof node === "object"
      ? Object.entries(node as Tree).flatMap(([k, v]) =>
          flat(v, prefix ? `${prefix}.${k}` : k)
        )
      : [prefix];
  const leaves = (node: unknown, prefix = ""): [string, unknown][] =>
    node && typeof node === "object"
      ? Object.entries(node as Tree).flatMap(([k, v]) =>
          leaves(v, prefix ? `${prefix}.${k}` : k)
        )
      : [[prefix, node]];

  it.each([
    "KoskDirectory",
    "HideLevel",
    "KoskManage",
    "MadrasahsPage",
    "OpenKoskDialog",
    "KoskNazimPicker",
    "KoskSettings",
    "HideKoskDialog",
    "KoskNazims",
    "AddNazimDialog",
  ])("%s has the same keys, all filled, in tr, en and ar", (ns) => {
    const tree = (locale: "tr" | "en" | "ar") =>
      (resources[locale].nizam as unknown as Tree)[ns];
    const keys = (locale: "tr" | "en" | "ar") => flat(tree(locale)).sort();
    expect(keys("tr").length).toBeGreaterThan(0);
    expect(keys("en")).toEqual(keys("tr"));
    expect(keys("ar")).toEqual(keys("tr"));
    for (const locale of ["tr", "en", "ar"] as const) {
      for (const [key, value] of leaves(tree(locale))) {
        expect(value, `${locale}.${ns}.${key}`).toBeTruthy();
      }
    }
  });

  it("names the four covers and the four levels in all three languages", () => {
    for (const locale of ["tr", "en", "ar"] as const) {
      const nizam = resources[locale].nizam as unknown as Record<
        string,
        Record<string, Record<string, string>>
      >;
      for (const ns of ["OpenKoskDialog", "KoskSettings"] as const) {
        for (const tone of COVER_TONES) {
          expect(nizam[ns]?.covers?.[tone]).toBeTruthy();
        }
        for (const level of ["ALL", "BEGINNER", "INTERMEDIATE", "ADVANCED"]) {
          expect(nizam[ns]?.levels?.[level]).toBeTruthy();
        }
      }
    }
  });
});
