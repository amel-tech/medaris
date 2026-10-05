import { describe, expect, it } from "vitest";
import {
  appointsOnly,
  boxState,
  chosenCodes,
  courseNazirErrorKey,
  courseNazirRows,
  courseNazirsContext,
  listMoved,
  pickProblem,
  unchangedPost,
} from "~/features/course-nazirs/course-nazirs";
import { dayFormat } from "~/lib/dates";
import { translatorFor } from "./server-render";

/**
 * Ders nazırları of a course (MDRS-270) as rules: the rows of the table, the
 * boxes of the dialog, whom it refuses before sending, and how a refusal is
 * worded. Pure: no server, no DOM.
 */
const t = translatorFor("nazar");
const day = dayFormat("tr", "Europe/Istanbul");

const person = (id: string, name: string | null, email: string | null) => ({
  id,
  name,
  email,
});
const MUDERRIS = person(
  "u-0",
  "Mehmet Emin Işıkoğlu",
  "m.isikoglu@example.com"
);

/** A post as `GET /courses/:id/nazirs` sends one; a spec overrides what it is about. */
const post = (over: Record<string, unknown> = {}) => ({
  id: "p-1",
  user: person("u-1", "Fatma Zehra Çelebioğlu", "fz@example.com"),
  permissions: ["session.manage", "recording.manage"],
  endsAt: null as Date | null,
  grantedBy: MUDERRIS,
  grantedAt: new Date("2026-09-30T09:00:00Z"),
  mayEdit: true,
  mayEnd: true,
  ...over,
});

const list = (items: ReturnType<typeof post>[], over = {}) => ({
  course: { id: "c-1", title: "Bina ve İzhar Şerhi", madrasahName: null },
  items,
  catalog: ["course.edit", "session.manage", "recording.manage"],
  grantable: ["course.edit", "session.manage"],
  mayAppoint: true,
  ...over,
});

describe("the rows of Ders nazırları", () => {
  it("names the person, counts their permissions and lists their sentences", () => {
    const [row] = courseNazirRows(list([post()]), {
      t,
      day,
      viewerId: "u-0",
    });
    expect(row).toMatchObject({
      id: "p-1",
      userId: "u-1",
      name: "Fatma Zehra Çelebioğlu",
      email: "fz@example.com",
      codes: ["session.manage", "recording.manage"],
      count: "2 izin",
      permissionsLine:
        "Celse ekle, tarihini değiştir, iptal et; toplantı bağlantısını gir · Ders kaydı ekle, adlandır, gizle; görünürlüğünü değiştir",
      mayEdit: true,
      mayEnd: true,
      isYou: false,
    });
  });

  it("says 'İzin yok' for a post that holds none, and has no sentence line", () => {
    const [row] = courseNazirRows(list([post({ permissions: [] })]), {
      t,
      day,
      viewerId: null,
    });
    expect(row?.count).toBe("İzin yok");
    expect(row?.permissionsLine).toBeNull();
  });

  it("falls back from the name to the address, then to 'Adı bilinmiyor'", () => {
    const rows = courseNazirRows(
      list([
        post({ id: "p-1", user: person("u-1", null, "kimse@example.com") }),
        post({
          id: "p-2",
          user: person("u-2", null, null),
          grantedBy: person("u-0", null, null),
        }),
      ]),
      { t, day, viewerId: null }
    );
    expect(rows.map((row) => row.name)).toEqual([
      "kimse@example.com",
      "Adı bilinmiyor",
    ]);
    expect(rows[1]?.giver.name).toBe("Adı bilinmiyor");
  });

  it("says 'Süresiz' for a post with no end, and the end's day on the viewer's clock otherwise", () => {
    const rows = courseNazirRows(
      list([
        post({ id: "p-1" }),
        // 23:30 in UTC is the next day in Istanbul
        post({ id: "p-2", endsAt: new Date("2026-12-31T23:30:00Z") }),
      ]),
      { t, day, viewerId: null }
    );
    expect(rows[0]?.ends).toEqual({ label: "Süresiz", iso: null });
    expect(rows[1]?.ends).toEqual({
      label: "1 Ocak 2027",
      iso: "2026-12-31T23:30:00.000Z",
    });
  });

  it("names who appointed, with '(siz)' for the viewer, whatever the case of the id", () => {
    const [row] = courseNazirRows(list([post()]), {
      t,
      day,
      viewerId: "U-0",
    });
    expect(row?.giver).toEqual({
      name: "Mehmet Emin Işıkoğlu",
      isYou: true,
      at: { label: "30 Eylül 2026", iso: "2026-09-30T09:00:00.000Z" },
    });
    expect(row?.appointedLine).toBe(
      "Atayan: Mehmet Emin Işıkoğlu · 30 Eylül 2026"
    );
  });

  it("marks the viewer's own post", () => {
    const rows = courseNazirRows(
      list([post({ mayEdit: false, mayEnd: false })]),
      { t, day, viewerId: "u-1" }
    );
    expect(rows[0]).toMatchObject({ isYou: true, mayEdit: false });
  });

  it("counts the posts each person appointed, which must end before theirs", () => {
    const rows = courseNazirRows(
      list([
        post({ id: "p-1", user: person("u-1", "Fatma", null) }),
        post({
          id: "p-2",
          user: person("u-2", "Ahmed", null),
          grantedBy: person("U-1", "Fatma", null),
        }),
        post({
          id: "p-3",
          user: person("u-3", "Zeynep", null),
          grantedBy: person("u-1", "Fatma", null),
        }),
      ]),
      { t, day, viewerId: null }
    );
    expect(rows.map((row) => row.appointees)).toEqual([2, 0, 0]);
  });
});

describe("what the page passes to the dialogs", () => {
  it("carries the catalog, what the caller may give and who holds a post", () => {
    expect(
      courseNazirsContext(list([post()]), {
        courseId: "c-1",
        timeZone: "Europe/Berlin",
        viewerId: "u-0",
      })
    ).toEqual({
      courseId: "c-1",
      courseTitle: "Bina ve İzhar Şerhi",
      catalog: ["course.edit", "session.manage", "recording.manage"],
      grantable: ["course.edit", "session.manage"],
      timeZone: "Europe/Berlin",
      viewerId: "u-0",
      holders: ["u-1"],
    });
  });

  it("says an appointer appoints only: may appoint, may give nothing", () => {
    expect(appointsOnly(list([], { grantable: [] }))).toBe(true);
    expect(appointsOnly(list([]))).toBe(false);
    expect(appointsOnly(list([], { grantable: [], mayAppoint: false }))).toBe(
      false
    );
  });
});

describe("the boxes of the dialog", () => {
  const of = {
    grantable: ["course.edit"],
    held: ["recording.manage"],
    chosen: ["recording.manage"],
  };

  it("are on for a code the caller may give", () => {
    expect(boxState("course.edit", of)).toEqual({
      enabled: true,
      ticked: false,
    });
  });

  it("leave a code the caller may not give off", () => {
    expect(boxState("session.manage", of)).toEqual({
      enabled: false,
      ticked: false,
    });
  });

  it("let a held code the caller could not give be unticked, since that is no gift", () => {
    expect(boxState("recording.manage", of)).toEqual({
      enabled: true,
      ticked: true,
    });
  });

  it("send the codes ticked in the catalog's order", () => {
    expect(
      chosenCodes(
        ["course.edit", "session.manage", "recording.manage"],
        ["recording.manage", "course.edit", "user.lookup"]
      )
    ).toEqual(["course.edit", "recording.manage"]);
  });
});

describe("whom the dialog refuses before sending", () => {
  const of = { viewerId: "u-0", holders: ["u-1", "u-2"] };

  it("refuses the viewer, whatever the case of the id", () => {
    expect(pickProblem({ id: "U-0" }, of)).toBe("self");
  });

  it("refuses a person who holds a post here already", () => {
    expect(pickProblem({ id: "u-2" }, of)).toBe("already");
  });

  it("lets anyone else be appointed, and says nothing before a person is found", () => {
    expect(pickProblem({ id: "u-9" }, of)).toBeNull();
    expect(pickProblem(null, of)).toBeNull();
    expect(pickProblem({ id: "u-9" }, { viewerId: null, holders: [] })).toBe(
      null
    );
  });
});

describe("a save that changes nothing", () => {
  const row = {
    codes: ["session.manage", "recording.manage"],
    ends: { label: "31 Aralık 2026", iso: "2026-12-31T20:59:59.000Z" },
  };

  it("is the same codes, in any order, and the same instant", () => {
    expect(
      unchangedPost(row, {
        permissions: ["recording.manage", "session.manage"],
        endsAt: "2026-12-31T20:59:59.000Z",
      })
    ).toBe(true);
  });

  it("is not a code more or less, an end moved, taken away or set", () => {
    const endsAt = "2026-12-31T20:59:59.000Z";
    expect(
      unchangedPost(row, { permissions: ["session.manage"], endsAt })
    ).toBe(false);
    expect(
      unchangedPost(row, {
        permissions: ["session.manage", "recording.manage", "course.edit"],
        endsAt,
      })
    ).toBe(false);
    const permissions = ["session.manage", "recording.manage"];
    expect(
      unchangedPost(row, { permissions, endsAt: "2026-12-31T20:59:00.000Z" })
    ).toBe(false);
    expect(unchangedPost(row, { permissions, endsAt: null })).toBe(false);
    expect(
      unchangedPost(
        { ...row, ends: { label: "Süresiz", iso: null } },
        { permissions, endsAt }
      )
    ).toBe(false);
    expect(
      unchangedPost(
        { ...row, ends: { label: "Süresiz", iso: null } },
        { permissions, endsAt: null }
      )
    ).toBe(true);
  });
});

describe("a refusal", () => {
  it("is worded from its code", () => {
    expect(
      Object.fromEntries(
        [
          "SELF_GRANT_REFUSED",
          "AUTHZ_FORBIDDEN",
          "PERMISSION_NOT_GIVABLE",
          "PERMISSION_UNKNOWN",
          "NAZIR_NOT_APPOINTED_BY_YOU",
          "GRANT_EXCEEDS_GIVER",
          "GRANT_EXPIRY_INVALID",
          "COURSE_NAZIR_EXISTS",
          "COURSE_NAZIR_NOT_FOUND",
          "COURSE_NAZIR_UNKNOWN_ACCOUNT",
          "COURSE_NAZIR_HOLDS_SEAT",
          "COURSE_NAZIR_BARRED",
          "GRANT_COURSE_INVALID",
          "DISMISS_SEAT_HANDED_ON",
          "KEYCLOAK_ADMIN_UNAVAILABLE",
        ].map((code) => [code, t(courseNazirErrorKey(code))])
      )
    ).toEqual({
      SELF_GRANT_REFUSED:
        "Kendinize rol ya da izin veremezsiniz; size verilmiş bir rolü ya da izni devralmak da buna girer.",
      AUTHZ_FORBIDDEN: "Bunu yapma izniniz yok.",
      PERMISSION_NOT_GIVABLE: "Bunu yapma izniniz yok.",
      PERMISSION_UNKNOWN:
        "Seçtiğiniz izinlerden biri tanınmıyor. Sayfayı yenileyip yeniden deneyin.",
      NAZIR_NOT_APPOINTED_BY_YOU:
        "Yalnız kendi atadığınız ders nazırlarını görevden alabilirsiniz.",
      GRANT_EXCEEDS_GIVER: "Kendinizde olmayan bir izni veremezsiniz.",
      GRANT_EXPIRY_INVALID: "Bitiş zamanı şu andan sonra olmalı.",
      COURSE_NAZIR_EXISTS: "Bu kişi bu dersin ders nazırı zaten.",
      COURSE_NAZIR_NOT_FOUND: "Bu ders nazırı artık yok; liste yenilendi.",
      COURSE_NAZIR_UNKNOWN_ACCOUNT: "Bu hesap bulunamadı.",
      COURSE_NAZIR_HOLDS_SEAT:
        "Bu kişinin bu derste zaten bir görevi var (müderris, medrese ya da köşk görevi); ders nazırı yapılamaz.",
      COURSE_NAZIR_BARRED: "Bu kişi bu dersten yasaklı; ders nazırı yapılamaz.",
      GRANT_COURSE_INVALID: "Gizli bir derse ders nazırı atanamaz.",
      DISMISS_SEAT_HANDED_ON:
        "Bu ders nazırının atadığı ders nazırları var; önce onları görevden alın.",
      KEYCLOAK_ADMIN_UNAVAILABLE:
        "Hesap şu an doğrulanamıyor. Biraz sonra yeniden deneyin.",
    });
  });

  it("in general terms when the code is one it does not know, or none", () => {
    for (const code of ["SOMETHING_NEW", ""]) {
      expect(t(courseNazirErrorKey(code))).toBe(
        "Bir şeyler ters gitti. Biraz sonra yeniden deneyin."
      );
    }
  });

  it("closes the dialog only when the post it showed is not there or not alone", () => {
    expect(listMoved("COURSE_NAZIR_EXISTS")).toBe(true);
    expect(listMoved("COURSE_NAZIR_NOT_FOUND")).toBe(true);
    for (const code of [
      "GRANT_EXCEEDS_GIVER",
      "AUTHZ_FORBIDDEN",
      "DISMISS_SEAT_HANDED_ON",
      "",
    ]) {
      expect(listMoved(code), code).toBe(false);
    }
  });
});
