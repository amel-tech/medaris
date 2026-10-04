import { resources } from "@medaris/i18n";
import { describe, expect, it } from "vitest";
import {
  awaitingGrants,
  awaitingNotice,
  dismissDecisions,
  dismissReady,
  dropSummary,
  extraCodes,
  givenRoleLine,
  heldGroups,
  isEmailLike,
  nazirErrorKey,
  nazirRows,
  PERMISSION_WINDOW_OPENS_AT,
  permissionLabel,
  permissionsLine,
  permissionWindowOpen,
  personName,
  pickedPerson,
} from "~/features/nazirs/nazirs";
import { dayFormat, dayMonthLocative } from "~/lib/dates";
import { translatorFor } from "./server-render";

const t = translatorFor("nazir");
const IST = "Europe/Istanbul";
const day = dayFormat("tr", IST);

const person = (
  name: string | null,
  email: string | null = null,
  id = name
) => ({
  id: id ?? "u",
  name,
  email,
});

/** A nazır as `GET /madrasahs/:id/nazirs` sends one; a spec overrides what it is about. */
const nazir = (over: Record<string, unknown> = {}) =>
  ({
    user: person("Fatma Zehra Çelebioğlu", "fz@example.com", "u-1"),
    appointedBy: person("Mehmet Emin Işıkoğlu", null, "u-0"),
    appointedAt: new Date("2026-09-12T09:00:00Z"),
    assignmentExpiresAt: null,
    expiresAt: null,
    groups: [],
    permissions: [],
    courseGrants: [],
    grantedBy: null,
    grantedAt: null,
    ...over,
  }) as never;

const group = (name: string, id = name) => ({ id, name, permissions: [] });
const grant = (code: string) => ({
  code,
  grantedAt: new Date("2026-09-12T09:00:00Z"),
});

describe("the version gate of 'Görevden al' and 'İzinleri düzenle'", () => {
  it("opens on 4 Ekim 2026 at midnight in Istanbul and not a moment before", () => {
    expect(new Date(PERMISSION_WINDOW_OPENS_AT).toISOString()).toBe(
      "2026-10-03T21:00:00.000Z"
    );
    expect(permissionWindowOpen(Date.parse("2026-10-02T09:00:00+03:00"))).toBe(
      false
    );
    expect(permissionWindowOpen(Date.parse("2026-10-03T23:59:59+03:00"))).toBe(
      false
    );
    expect(permissionWindowOpen(Date.parse("2026-10-04T00:00:00+03:00"))).toBe(
      true
    );
    expect(permissionWindowOpen(Date.parse("2026-12-01T00:00:00+03:00"))).toBe(
      true
    );
  });
});

describe("permission sentences", () => {
  it("takes the account page's sentence for a code", () => {
    expect(permissionLabel("course.edit", t)).toBe(
      "Dersi düzenle: başlık, tanıtım, müfredat, saat dilimi"
    );
  });

  it("shows a code that has no sentence as it is, so that the count never lies", () => {
    expect(permissionLabel("madrasah.new_thing", t)).toBe("madrasah.new_thing");
  });

  it("sums single permissions up: 'Ayrıca N izin' beside a group, 'N izin' alone, nothing for none", () => {
    const codes = ["course.edit", "session.manage", "week.hide"];
    expect(
      permissionsLine({ groups: [group("Ders açma")], permissions: codes }, t)
    ).toMatch(
      /^Ayrıca 3 izin: Dersi düzenle.*·.*Celse ekle.*·.*Hafta ve celse/
    );
    expect(permissionsLine({ groups: [], permissions: codes }, t)).toMatch(
      /^3 izin: Dersi düzenle/
    );
    expect(
      permissionsLine({ groups: [group("Ders açma")], permissions: [] }, t)
    ).toBeNull();
  });
});

describe("nazir 05's rows (criterion 1)", () => {
  const rows = nazirRows(
    [
      nazir({
        groups: [group("Ders açma ve kadro"), group("Yasak ve itiraz")],
        permissions: [grant("course.edit"), grant("week.hide")],
        grantedBy: person("Mehmet Emin Işıkoğlu"),
        grantedAt: new Date("2026-09-12T09:00:00Z"),
      }),
      nazir({
        user: person("Ümmügülsüm Nur Hacıosmanoğlu", "u@example.com", "u-2"),
        groups: [group("Kayıt ve talebe işleri")],
        expiresAt: new Date("2026-12-31T20:59:59Z"),
        grantedBy: person("Mehmet Emin Işıkoğlu"),
        grantedAt: new Date("2026-09-20T09:00:00Z"),
      }),
      nazir({
        user: person("Abdullah Talha Erzurumluoğlu", "a@example.com", "u-3"),
        appointedBy: person("Fatma Zehra Çelebioğlu"),
        appointedAt: new Date("2026-09-30T09:00:00Z"),
      }),
    ],
    t,
    day
  );

  it("shows the groups, the count of single permissions, the end and the giver", () => {
    expect(rows[0]).toMatchObject({
      id: "u-1",
      name: "Fatma Zehra Çelebioğlu",
      email: "fz@example.com",
      groups: ["Ders açma ve kadro", "Yasak ve itiraz"],
      permissionCount: 2,
      awaiting: false,
      end: { label: "Süresiz", iso: null },
      giver: { name: "Mehmet Emin Işıkoğlu" },
    });
    expect(rows[0]?.extra).toMatch(/^Ayrıca 2 izin: /);
    expect(rows[0]?.giver?.at.label).toBe("12 Eylül 2026");
    expect(rows[1]).toMatchObject({
      groups: ["Kayıt ve talebe işleri"],
      extra: null,
      end: { label: "31 Aralık 2026", iso: "2026-12-31T20:59:59.000Z" },
    });
    expect(rows[1]?.giver?.at.label).toBe("20 Eylül 2026");
  });

  it("shows a nazır who holds nothing with 'Atayan', the appointment day and dashes (criterion 2)", () => {
    expect(rows[2]).toMatchObject({
      awaiting: true,
      groups: [],
      extra: null,
      end: null,
      giver: null,
      appointedLine: "Atayan: Fatma Zehra Çelebioğlu · 30 Eylül 2026",
    });
  });

  it("keeps the API's order", () => {
    expect(rows.map((row) => row.id)).toEqual(["u-1", "u-2", "u-3"]);
  });

  it("names a person with no name by their address, else says the name is unknown", () => {
    expect(personName(person(null, "x@y.test"), "?")).toBe("x@y.test");
    expect(personName(person(null, null), "Adı bilinmiyor")).toBe(
      "Adı bilinmiyor"
    );
    expect(personName(null, "Adı bilinmiyor")).toBe("Adı bilinmiyor");
  });
});

describe("what a nazır holds in the medrese's courses", () => {
  const dersAcma = {
    id: "g-1",
    name: "Ders açma ve kadro",
    permissions: ["course.edit", "session.manage"],
  };
  const onlyHere = {
    id: "g-2",
    name: "Kayıt ve talebe işleri",
    permissions: ["enrollment.decide"],
  };
  const inCourse = (
    title: string | null,
    over: Record<string, unknown> = {}
  ) => ({
    courseId: `c-${title}`,
    courseTitle: title,
    permission: null,
    group: null,
    grantedAt: new Date("2026-09-12T09:00:00Z"),
    ...over,
  });
  const held = nazir({
    groups: [dersAcma],
    permissions: [grant("course.edit"), grant("madrasah.nazir_appoint")],
    courseGrants: [
      inCourse("Bina ve İzhar Şerhi", { group: onlyHere }),
      inCourse("Bina ve İzhar Şerhi", { permission: "week.hide" }),
      inCourse("İsâgûcî", { permission: "week.hide" }),
      inCourse("İsâgûcî", { permission: "session.manage" }),
    ],
  });

  it("lists a group held only in some courses beside the medrese's, each once", () => {
    expect(heldGroups(held).map((g) => g.name)).toEqual([
      "Ders açma ve kadro",
      "Kayıt ve talebe işleri",
    ]);
  });

  it("counts a single permission once however many places hold it, and not one a group carries", () => {
    // course.edit and session.manage are the first group's; week.hide is held in two courses
    expect(extraCodes(held)).toEqual(["madrasah.nazir_appoint", "week.hide"]);
  });

  it("is a nazır who holds something, though only in a course (criterion 1)", () => {
    expect(
      awaitingGrants({
        groups: [],
        permissions: [],
        courseGrants: [inCourse("A")],
      })
    ).toBe(false);
    expect(
      awaitingGrants({ groups: [], permissions: [], courseGrants: [] })
    ).toBe(true);
    expect(
      awaitingNotice([nazir({ courseGrants: [inCourse("A")] })], t, {
        locale: "tr",
        timeZone: IST,
      })
    ).toBeNull();
  });

  it("is worded in the row: the groups, 'Ayrıca N izin', and the courses the course permissions are limited to", () => {
    const [row] = nazirRows([held], t, day);
    expect(row).toMatchObject({
      groups: ["Ders açma ve kadro", "Kayıt ve talebe işleri"],
      permissionCount: 2,
      awaiting: false,
      courseScope:
        "Ders izinleri yalnız şu derslerde: Bina ve İzhar Şerhi · İsâgûcî",
    });
    expect(row?.extra).toMatch(
      /^Ayrıca 2 izin: Medrese nazırı ata · Hafta ve celse/
    );
    expect(nazirRows([nazir()], t, day)[0]?.courseScope).toBeNull();
  });

  it("carries the end of the appointment, which a permission cannot outlast", () => {
    const [row] = nazirRows(
      [nazir({ assignmentExpiresAt: new Date("2026-12-31T20:59:59Z") })],
      t,
      day
    );
    expect(row?.assignmentEnd).toBe("2026-12-31T20:59:59.000Z");
    expect(nazirRows([nazir()], t, day)[0]?.assignmentEnd).toBeNull();
  });
});

describe("a nazır who holds nothing yet (criterion 3)", () => {
  it("is one with neither a group nor a permission", () => {
    expect(awaitingGrants({ groups: [], permissions: [] })).toBe(true);
    expect(awaitingGrants({ groups: [group("A")], permissions: [] })).toBe(
      false
    );
    expect(awaitingGrants({ groups: [], permissions: ["course.edit"] })).toBe(
      false
    );
  });

  it("is named in the band with who appointed them and the day, with the Turkish case ending", () => {
    const notice = awaitingNotice(
      [
        nazir({
          user: person("Abdullah Talha Erzurumluoğlu", null, "u-3"),
          appointedBy: person("Fatma Zehra Çelebioğlu"),
          appointedAt: new Date("2026-09-30T09:00:00Z"),
        }),
      ],
      t,
      { locale: "tr", timeZone: IST }
    );
    expect(notice).toEqual({
      title: "Abdullah Talha Erzurumluoğlu henüz izin almadı",
      text: "Fatma Zehra Çelebioğlu 30 Eylül’de atadı. Siz izin verene kadar hiçbir işlem yapamaz.",
    });
  });

  it("counts them when there are several, and is absent when everyone holds something", () => {
    const several = awaitingNotice(
      [
        nazir({ user: person("A B", null, "u-1") }),
        nazir({ user: person("C D", null, "u-2") }),
        nazir({ user: person("E F", null, "u-3"), groups: [group("G")] }),
      ],
      t,
      { locale: "tr", timeZone: IST }
    );
    expect(several).toEqual({
      title: "2 nazır henüz izin almadı",
      text: "A B ve C D. Siz izin verene kadar hiçbir işlem yapamazlar.",
    });
    expect(
      awaitingNotice([nazir({ groups: [group("G")] })], t, {
        locale: "tr",
        timeZone: IST,
      })
    ).toBeNull();
    expect(awaitingNotice([], t, { locale: "tr", timeZone: IST })).toBeNull();
  });
});

describe("a Turkish date with its case ending", () => {
  it("takes -de/-da/-te/-ta by the month's name", () => {
    const endings = Array.from({ length: 12 }, (_, month) =>
      dayMonthLocative(new Date(Date.UTC(2026, month, 15, 9)), "tr", IST)
    );
    expect(endings).toEqual([
      "15 Ocak’ta",
      "15 Şubat’ta",
      "15 Mart’ta",
      "15 Nisan’da",
      "15 Mayıs’ta",
      "15 Haziran’da",
      "15 Temmuz’da",
      "15 Ağustos’ta",
      "15 Eylül’de",
      "15 Ekim’de",
      "15 Kasım’da",
      "15 Aralık’ta",
    ]);
  });

  it("reads the month in the viewer's zone and leaves other languages the bare date", () => {
    // 21:30 UTC on 30 September is already 1 Ekim in Istanbul
    expect(dayMonthLocative(new Date("2026-09-30T21:30:00Z"), "tr", IST)).toBe(
      "1 Ekim’de"
    );
    expect(dayMonthLocative(new Date("2026-09-30T09:00:00Z"), "en", IST)).toBe(
      "September 30"
    );
  });
});

describe("the appointment's search", () => {
  it("searches only an address that could be one", () => {
    expect(isEmailLike("ad.soyad@example.com")).toBe(true);
    expect(isEmailLike("  ad@example.com ")).toBe(true);
    for (const text of ["", "ad", "ad@", "ad@example", "ad @example.com"]) {
      expect(isEmailLike(text), text).toBe(false);
    }
  });

  it("shows the person found by name, else by address", () => {
    expect(
      pickedPerson({
        id: "u",
        givenName: "Abdullah Talha",
        familyName: "Erzurumluoğlu",
        email: "a@example.com",
      })
    ).toEqual({
      id: "u",
      name: "Abdullah Talha Erzurumluoğlu",
      email: "a@example.com",
    });
    expect(pickedPerson({ id: "u", email: "a@example.com" }).name).toBe(
      "a@example.com"
    );
  });
});

describe("the dismissal's choices (criterion 1)", () => {
  const given = (...ids: string[]) =>
    ids.map((id) => ({ user: person(id, null, id) }));

  it("stay off until every person listed has an answer", () => {
    const rows = given("a", "b", "c");
    expect(dismissReady(rows, {})).toBe(false);
    expect(dismissReady(rows, { a: "TAKE_OVER" })).toBe(false);
    expect(
      dismissReady(rows, { a: "TAKE_OVER", b: "DROP", c: undefined })
    ).toBe(false);
    expect(dismissReady(rows, { a: "TAKE_OVER", b: "DROP", c: "DROP" })).toBe(
      true
    );
  });

  it("are ready at once when the nazır gave no one anything, and send an empty list", () => {
    expect(dismissReady([], {})).toBe(true);
    expect(dismissDecisions([], {})).toEqual([]);
  });

  it("send one decision per person listed, in the order listed", () => {
    expect(
      dismissDecisions(given("a", "b"), { b: "DROP", a: "TAKE_OVER" })
    ).toEqual([
      { userId: "a", action: "TAKE_OVER" },
      { userId: "b", action: "DROP" },
    ]);
  });
});

describe("what a dismissal drops at once", () => {
  const who = { name: "Fatma Zehra Çelebioğlu" };

  it("names the groups and counts the extra permissions", () => {
    expect(
      dropSummary(
        {
          ...who,
          groups: ["Ders açma ve kadro", "Yasak ve itiraz"],
          permissionCount: 3,
        },
        t,
        "tr"
      )
    ).toBe(
      "Görevden alınırsa Fatma Zehra Çelebioğlu için “Ders açma ve kadro” ve “Yasak ve itiraz” grupları ile 3 ek izin hemen düşer."
    );
  });

  it("says a group in the singular, and leaves out what is not held", () => {
    expect(
      dropSummary(
        { ...who, groups: ["Yasak ve itiraz"], permissionCount: 0 },
        t,
        "tr"
      )
    ).toBe(
      "Görevden alınırsa Fatma Zehra Çelebioğlu için “Yasak ve itiraz” grubu hemen düşer."
    );
    expect(
      dropSummary({ ...who, groups: [], permissionCount: 2 }, t, "tr")
    ).toBe(
      "Görevden alınırsa Fatma Zehra Çelebioğlu için 2 ek izin hemen düşer."
    );
  });

  it("says there is nothing to drop for a nazır who holds nothing", () => {
    expect(
      dropSummary({ ...who, groups: [], permissionCount: 0 }, t, "tr")
    ).toBe(
      "Fatma Zehra Çelebioğlu henüz izin almadığı için düşecek bir izin yok."
    );
  });
});

describe("a role the nazır gave", () => {
  const role = (over: Record<string, unknown> = {}) =>
    ({
      role: "MEDRESE_NAZIR",
      scopeType: "madrasah",
      scopeName: "Süleymaniye Medresesi",
      grantedAt: new Date("2026-09-30T09:00:00Z"),
      expiresAt: null,
      ...over,
    }) as never;

  it("is one line: the role, the scope, the end and the day it was given", () => {
    expect(givenRoleLine(role(), t, day)).toBe(
      "Medrese nazırı · Süleymaniye Medresesi · süresiz · verildi 30 Eylül 2026"
    );
    expect(
      givenRoleLine(
        role({
          role: "DERS_NAZIR",
          scopeType: "course",
          scopeName: "Bina ve İzhar Şerhi",
          expiresAt: new Date("2026-12-31T20:59:59Z"),
        }),
        t,
        day
      )
    ).toBe(
      "Ders nazırı · Bina ve İzhar Şerhi · 31 Aralık 2026 tarihine kadar · verildi 30 Eylül 2026"
    );
  });

  it("leaves out a scope without a name", () => {
    expect(givenRoleLine(role({ scopeName: null }), t, day)).toBe(
      "Medrese nazırı · süresiz · verildi 30 Eylül 2026"
    );
  });
});

describe("a refused appointment or dismissal", () => {
  it("is worded from the API's code", () => {
    expect(nazirErrorKey("DISMISS_DECISIONS_INCOMPLETE")).toBe(
      "Dismiss.changed"
    );
    expect(nazirErrorKey("MADRASAH_NAZIR_NOT_FOUND")).toBe("Dismiss.gone");
    expect(nazirErrorKey("DISMISS_SEAT_HANDED_ON")).toBe("Dismiss.cascade");
    expect(nazirErrorKey("SELF_GRANT_REFUSED")).toBe("Problems.selfGrant");
    expect(nazirErrorKey("AUTHZ_FORBIDDEN")).toBe("Problems.actionForbidden");
    expect(nazirErrorKey("")).toBe("Problems.actionGeneric");
  });

  it("is worded from the codes of a permission change or a group write", () => {
    expect(nazirErrorKey("PERMISSION_NOT_GIVABLE")).toBe(
      "Problems.actionForbidden"
    );
    expect(nazirErrorKey("PERMISSION_UNKNOWN")).toBe(
      "Problems.permissionUnknown"
    );
    expect(nazirErrorKey("GRANT_EXCEEDS_GIVER")).toBe("Problems.exceedsGiver");
    expect(nazirErrorKey("NAZIR_COURSE_SCOPE_INVALID")).toBe(
      "Problems.courseScope"
    );
    expect(nazirErrorKey("GRANT_EXPIRY_INVALID")).toBe(
      "Problems.expiryInvalid"
    );
    expect(nazirErrorKey("PERMISSION_GROUP_NOT_FOUND")).toBe(
      "Problems.groupGone"
    );
    expect(nazirErrorKey("PERMISSION_GROUP_NAME_TAKEN")).toBe(
      "Problems.groupNameTaken"
    );
  });
});

describe("message keys of the nazır screens", () => {
  const dig = (node: unknown, path: string) =>
    path
      .split(".")
      .reduce<unknown>(
        (n, part) => (n as Record<string, unknown> | undefined)?.[part],
        node
      );

  for (const locale of ["tr", "en", "ar"] as const) {
    it(`${locale} has a message for every code the screens word at run time`, () => {
      const catalogue = resources[locale].nazir;
      for (const code of [
        "DISMISS_DECISIONS_INCOMPLETE",
        "MADRASAH_NAZIR_NOT_FOUND",
        "AUTHZ_FORBIDDEN",
        "PERMISSION_NOT_GIVABLE",
        "PERMISSION_UNKNOWN",
        "GRANT_EXCEEDS_GIVER",
        "NAZIR_COURSE_SCOPE_INVALID",
        "GRANT_EXPIRY_INVALID",
        "PERMISSION_GROUP_NOT_FOUND",
        "PERMISSION_GROUP_NAME_TAKEN",
        "",
      ]) {
        expect(
          dig(catalogue, nazirErrorKey(code)),
          `${locale} ${code}`
        ).toEqual(expect.any(String));
      }
      // the roles a nazır can have given: each is named by the account page's Roles
      for (const role of [
        "MEDRESE_NAZIR",
        "DERS_NAZIR",
        "MUDERRIS",
        "MEDRESE_BASMUDERRIS",
      ]) {
        expect(dig(catalogue, `Roles.${role}`), `${locale} ${role}`).toEqual(
          expect.any(String)
        );
      }
    });
  }
});
