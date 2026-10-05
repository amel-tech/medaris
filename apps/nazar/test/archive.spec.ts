import { resources } from "@medaris/i18n";
import { describe, expect, it } from "vitest";
import {
  ARCHIVE_TABS,
  archiveErrorKey,
  archiveHref,
  archiveRows,
  medreseRestoreOf,
  pageOf,
  pageWindow,
  restoreOf,
  tabOf,
  whenLabel,
} from "~/features/archive/archive";
import { translatorFor } from "./server-render";

const t = translatorFor("nazar");
const IST = "Europe/Istanbul";
const where = { locale: "tr", timeZone: IST };
const now = new Date("2026-10-02T12:00:00+03:00");

/** An item as `GET /madrasahs/:id/archive` sends one; a spec overrides what it is about. */
const item = (over: Record<string, unknown> = {}) =>
  ({
    type: "session",
    id: "s-1",
    title: "Telafi celsesi: altı bâb",
    koskId: "k-1",
    koskName: "Nûruosmaniye Köşkü",
    madrasahId: "m-1",
    madrasahName: "Süleymaniye Medresesi",
    courseId: "c-1",
    courseTitle: "Bina ve İzhar Şerhi",
    weekNumber: 2,
    scheduledAt: null,
    weekCount: null,
    sessionCount: null,
    studentCount: null,
    archivedAt: new Date("2026-09-28T13:10:00Z"),
    archivedBy: { id: "u-1", name: "Mehmet Emin Işıkoğlu", role: "MUDERRIS" },
    canRestore: true,
    hiddenLevel: "course",
    ...over,
  }) as never;

describe("the tabs", () => {
  it("ask the API for the types they name: 'Haftalar ve celseler' is week and session", () => {
    expect(ARCHIVE_TABS.map((tab) => [tab.id, tab.types])).toEqual([
      ["all", undefined],
      ["course", "course"],
      ["weeks", "week,session"],
      ["recordings", "recording"],
    ]);
  });

  it("count from the API's numbers, 'Haftalar ve celseler' as the two together", () => {
    const counts = { all: 6, course: 1, week: 1, session: 3, recording: 0 };
    expect(ARCHIVE_TABS.map((tab) => tab.count(counts))).toEqual([6, 1, 4, 0]);
  });

  it("are chosen by ?tur=, and a value nobody knows is 'Tümü'", () => {
    expect(tabOf("ders").id).toBe("course");
    expect(tabOf("hafta-celse").id).toBe("weeks");
    expect(tabOf("kayit").id).toBe("recordings");
    expect(tabOf(undefined).id).toBe("all");
    expect(tabOf("bilinmeyen").id).toBe("all");
    expect(tabOf("all").id).toBe("all");
  });

  it("are links that keep the page out of the address on the first page", () => {
    expect(archiveHref("m-1", tabOf(undefined), 1)).toBe("/medrese/m-1/arsiv");
    expect(archiveHref("m-1", tabOf("ders"), 1)).toBe(
      "/medrese/m-1/arsiv?tur=ders"
    );
    expect(archiveHref("m-1", tabOf("hafta-celse"), 3)).toBe(
      "/medrese/m-1/arsiv?tur=hafta-celse&sayfa=3"
    );
    expect(archiveHref("m 1", tabOf(undefined), 2)).toBe(
      "/medrese/m%201/arsiv?sayfa=2"
    );
  });
});

describe("the page of the list", () => {
  it("is a whole number from 1, else the first", () => {
    expect(pageOf("3")).toBe(3);
    for (const bad of [undefined, "", "0", "-1", "2.5", "abc"]) {
      expect(pageOf(bad), String(bad)).toBe(1);
    }
  });

  it("says which items it shows and whether there is a page either side", () => {
    expect(pageWindow(24, 1, 10)).toEqual({
      from: 1,
      to: 10,
      hasPrevious: false,
      hasNext: true,
    });
    expect(pageWindow(24, 3, 10)).toEqual({
      from: 21,
      to: 24,
      hasPrevious: true,
      hasNext: false,
    });
    expect(pageWindow(6, 1, 10)).toMatchObject({
      hasPrevious: false,
      hasNext: false,
    });
    expect(pageWindow(0, 1, 10)).toMatchObject({ from: 0, to: 0 });
  });
});

describe("when it was hidden (criterion 4)", () => {
  const label = (at: string) => whenLabel(new Date(at), now, where, t);

  it("is 'Bugün' and 'Dün' with the time, on the viewer's calendar", () => {
    expect(label("2026-10-01T07:40:00Z")).toBe("Dün 10:40");
    expect(label("2026-10-02T06:05:00Z")).toBe("Bugün 09:05");
    // 21:30 UTC on 1 Ekim is already 2 Ekim in Istanbul
    expect(label("2026-10-01T21:30:00Z")).toBe("Bugün 00:30");
  });

  it("is the day, the short month and the time for anything older", () => {
    expect(label("2026-09-28T13:10:00Z")).toBe("28 Eyl 16:10");
    expect(label("2026-09-26T09:00:00Z")).toBe("26 Eyl 12:00");
  });

  it("adds the year when it is not this one", () => {
    expect(label("2025-12-31T09:00:00Z")).toBe("31 Ara 2025 12:00");
  });
});

describe("'Geri al', or why not (criterion 2)", () => {
  const restore = (over: Record<string, unknown>) =>
    restoreOf(item(over) as never, t, "tr");

  it("is the button when the API says the caller may bring it back", () => {
    expect(restore({ canRestore: true })).toEqual({ kind: "button" });
  });

  it("names the kademe that hid it, in lower case after 'Bunu'", () => {
    expect(
      restore({
        canRestore: false,
        archivedBy: {
          id: "u-2",
          name: "Ömer Nasuhi Bilmenoğlu",
          role: "KOSK_NAZIM",
        },
      })
    ).toEqual({
      kind: "note",
      text: "Bunu köşk nazımı gizledi; yalnız o kademe ya da üstü geri alabilir.",
    });
    expect(
      restore({
        canRestore: false,
        archivedBy: { id: "u-2", name: null, role: "MEDRESE_BASMUDERRIS" },
      })
    ).toMatchObject({
      text: "Bunu medrese başmüderrisi gizledi; yalnız o kademe ya da üstü geri alabilir.",
    });
  });

  it("keeps the capital of Medaris yönetimi, the hider with a name and no role", () => {
    expect(
      restore({
        canRestore: false,
        archivedBy: { id: "u-3", name: "Yusuf Ziya Ertuğrul", role: null },
      })
    ).toEqual({
      kind: "note",
      text: "Bunu Medaris yönetimi gizledi; yalnız o kademe ya da üstü geri alabilir.",
    });
  });

  it("still says something when nobody is on record, or the role is one the screen has no word for", () => {
    const unknown = {
      kind: "note",
      text: "Yalnız gizleyen kademe ya da üstü geri alabilir.",
    };
    expect(restore({ canRestore: false, archivedBy: null })).toEqual(unknown);
    expect(
      restore({
        canRestore: false,
        archivedBy: { id: "u", name: null, role: "SOMETHING_NEW" },
      })
    ).toEqual(unknown);
  });
});

describe("the rows (criterion 4)", () => {
  const rows = archiveRows(
    [
      item({
        type: "course",
        id: "c-9",
        title: "Merâhu’l-ervâh okumaları",
        courseId: null,
        courseTitle: null,
        weekNumber: null,
        weekCount: 12,
        studentCount: 14,
        archivedAt: new Date("2026-09-20T14:30:00Z"),
        archivedBy: {
          id: "u-1",
          name: "Mehmet Emin Işıkoğlu",
          role: "MEDRESE_BASMUDERRIS",
        },
      }),
      item({
        type: "week",
        id: "w-9",
        title: "Hafta 9: Genel tekrar",
        courseTitle: "İsâgûcî ile mantığa giriş",
        weekNumber: 9,
        archivedBy: {
          id: "u-1",
          name: "Mehmet Emin Işıkoğlu",
          role: "MUDERRIS",
        },
      }),
      item({
        type: "session",
        scheduledAt: new Date("2026-09-26T16:00:00Z"),
        archivedBy: { id: "u-2", name: null, role: "KOSK_NAZIM" },
        canRestore: false,
        archivedAt: new Date("2026-10-01T07:05:00Z"),
      }),
    ],
    t,
    { ...where, now, viewerId: "U-1" }
  );

  it("words a course as its köşk, its weeks and its talebe, with its cover", () => {
    expect(rows[0]).toMatchObject({
      key: "course:c-9",
      type: "course",
      typeLabel: "Ders",
      typeIcon: "courses",
      title: "Merâhu’l-ervâh okumaları",
      context: "Nûruosmaniye Köşkü · 12 hafta · 14 talebe",
      cover: "c-9",
      when: { label: "20 Eyl 17:30", iso: "2026-09-20T14:30:00.000Z" },
    });
  });

  it("words a week as its course, and a session as its course, its week and its day", () => {
    expect(rows[1]).toMatchObject({
      typeLabel: "Hafta",
      typeIcon: "book",
      context: "İsâgûcî ile mantığa giriş",
      cover: null,
    });
    expect(rows[2]).toMatchObject({
      typeLabel: "Celse",
      typeIcon: "calendar",
      context: "Bina ve İzhar Şerhi · Hafta 2 · 26 Eyl 19:00",
    });
  });

  it("names who hid it with their role, and marks the caller's own ('siz')", () => {
    expect(rows[0]?.hider).toEqual({
      name: "Mehmet Emin Işıkoğlu",
      role: "Medrese başmüderrisi (siz)",
    });
    expect(rows[1]?.hider).toEqual({
      name: "Mehmet Emin Işıkoğlu",
      role: "Müderris (siz)",
    });
    expect(rows[2]?.hider).toEqual({
      name: "Adı bilinmiyor",
      role: "Köşk nazımı",
    });
  });

  it("puts the sentence in the button's place where the caller's kademe is too low", () => {
    expect(rows.map((row) => row.restore.kind)).toEqual([
      "button",
      "button",
      "note",
    ]);
    expect(rows[2]?.when.label).toBe("Dün 10:05");
  });

  it("leaves the hider out when nobody is on record, and a Medaris yönetimi hider's role is that name", () => {
    const [none, admin] = archiveRows(
      [
        item({ archivedBy: null }),
        item({ archivedBy: { id: "u-5", name: "Yusuf Ziya", role: null } }),
      ],
      t,
      { ...where, now }
    );
    expect(none?.hider).toBeNull();
    expect(admin?.hider).toEqual({
      name: "Yusuf Ziya",
      role: "Medaris yönetimi",
    });
  });
});

describe("the hidden medrese's banner (MDRS-143)", () => {
  const banner = (
    madrasah: Parameters<typeof medreseRestoreOf>[0]
  ): ReturnType<typeof medreseRestoreOf> => medreseRestoreOf(madrasah, t, "tr");
  const by = (role: string | null) => ({
    id: "u-2",
    name: "Ömer Nasuhi Bilmenoğlu",
    role,
  });

  it("is the button for whoever may bring the medrese back", () => {
    expect(
      banner({ canRestore: true, hiddenBy: by("MEDRESE_BASMUDERRIS") })
    ).toEqual({ kind: "button" });
  });

  it("names the kademe that hid it for whoever may not, as a row does", () => {
    expect(banner({ canRestore: false, hiddenBy: by(null) })).toEqual({
      kind: "note",
      text: "Bunu Medaris yönetimi gizledi; yalnız o kademe ya da üstü geri alabilir.",
    });
    expect(banner({ canRestore: false, hiddenBy: by("KOSK_NAZIM") })).toEqual({
      kind: "note",
      text: "Bunu köşk nazımı gizledi; yalnız o kademe ya da üstü geri alabilir.",
    });
    expect(banner({ canRestore: false, hiddenBy: null })).toEqual({
      kind: "note",
      text: "Yalnız gizleyen kademe ya da üstü geri alabilir.",
    });
  });
});

describe("a refused restore or hide", () => {
  it("is worded from the API's code", () => {
    expect(archiveErrorKey("ARCHIVE_FORBIDDEN")).toBe(
      "Archive.errors.forbidden"
    );
    expect(archiveErrorKey("ARCHIVE_RESTORE_LEVEL")).toBe(
      "Archive.errors.forbidden"
    );
    expect(archiveErrorKey("ARCHIVE_ITEM_NOT_FOUND")).toBe(
      "Archive.errors.gone"
    );
    expect(archiveErrorKey("ARCHIVE_PARENT_HIDDEN")).toBe(
      "Archive.errors.parentHidden"
    );
    expect(archiveErrorKey("MADRASAH_ALREADY_HIDDEN")).toBe(
      "Archive.hide.already"
    );
    expect(archiveErrorKey("MADRASAH_NOT_HIDDEN")).toBe(
      "Archive.hidden.notHidden"
    );
    expect(archiveErrorKey("AUTHZ_FORBIDDEN")).toBe("Problems.actionForbidden");
    expect(archiveErrorKey("")).toBe("Problems.actionGeneric");
  });
});

describe("message keys of the archive", () => {
  const dig = (node: unknown, path: string) =>
    path
      .split(".")
      .reduce<unknown>(
        (n, part) => (n as Record<string, unknown> | undefined)?.[part],
        node
      );

  for (const locale of ["tr", "en", "ar"] as const) {
    it(`${locale} has a message for every key the archive builds at run time`, () => {
      const catalogue = resources[locale].nazar;
      const keys = [
        ...ARCHIVE_TABS.flatMap((tab) => [
          `Archive.tabs.${tab.id}`,
          `Archive.empty.${tab.id}`,
        ]),
        ...["course", "week", "session", "recording"].map(
          (type) => `Archive.types.${type}`
        ),
        ...[
          "ARCHIVE_FORBIDDEN",
          "ARCHIVE_RESTORE_LEVEL",
          "ARCHIVE_ITEM_NOT_FOUND",
          "ARCHIVE_PARENT_HIDDEN",
          "MADRASAH_ALREADY_HIDDEN",
          "MADRASAH_NOT_HIDDEN",
          "AUTHZ_FORBIDDEN",
          "",
        ].map(archiveErrorKey),
        // the roles that can hide something
        ...[
          "KOSK_NAZIM",
          "MEDRESE_BASMUDERRIS",
          "MEDRESE_NAZIR",
          "MUDERRIS",
          "DERS_NAZIR",
        ].map((role) => `Roles.${role}`),
      ];
      for (const key of keys) {
        expect(dig(catalogue, key), `${locale} ${key}`).toEqual(
          expect.any(String)
        );
      }
    });
  }
});
