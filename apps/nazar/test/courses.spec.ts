import { resources } from "@medaris/i18n";
import { describe, expect, it } from "vitest";
import {
  blankForm,
  counterOf,
  courseErrorKey,
  courseRows,
  coursesHref,
  filtersOf,
  genitive,
  hideWords,
  hostLine,
  koskChoiceLine,
  koskOptions,
  locksOf,
  offsiteRequestHref,
  openCourseHref,
  openProblems,
  openRequest,
  statusOptions,
  titleProblem,
} from "~/features/courses/courses";
import { teamOf, teamReducer } from "~/features/courses/team";
import { translatorFor } from "./server-render";

const t = translatorFor("nazar");
const KOSK = "0b3b2c1a-5d4e-4f60-8a7b-9c0d1e2f3a4b";

const muderris = (over: Record<string, unknown> = {}) => ({
  userId: "u-1",
  name: "Mehmet Emin Işıkoğlu",
  title: null,
  email: "me@example.com",
  isImam: true,
  ...over,
});
const item = (over: Record<string, unknown> = {}) =>
  ({
    id: "c-1",
    title: "Bina ve İzhar Şerhi",
    koskId: "k-1",
    koskName: "Nûruosmaniye Köşkü",
    status: "PUBLISHED",
    requiresApproval: false,
    closed: false,
    createdAt: new Date("2026-09-20T09:00:00Z"),
    studentCount: 35,
    pendingCount: 2,
    muderris: [
      muderris(),
      muderris({
        userId: "u-2",
        name: "Abdülhamit Karaosmanoğlu",
        email: null,
        isImam: false,
      }),
    ],
    ...over,
  }) as never;

describe("the filters of Dersler (nazir 07)", () => {
  it("are read from the address, and a value nobody knows is 'tümü'", () => {
    expect(filtersOf({})).toEqual({ kosk: null, status: null });
    expect(filtersOf({ kosk: KOSK, durum: "taslak" })).toEqual({
      kosk: KOSK,
      status: "DRAFT",
    });
    expect(filtersOf({ durum: "yayinda" }).status).toBe("PUBLISHED");
    // a stale link must not reach the API as a 400
    expect(filtersOf({ kosk: "fatih", durum: "gizli" })).toEqual({
      kosk: null,
      status: null,
    });
    expect(filtersOf({ durum: "toString" }).status).toBeNull();
  });

  it("make the address back, and none leaves a bare one", () => {
    expect(coursesHref("m-1", { kosk: null, status: null })).toBe(
      "/medrese/m-1/dersler"
    );
    const href = coursesHref("m-1", { kosk: KOSK, status: "DRAFT" });
    expect(href).toBe(`/medrese/m-1/dersler?kosk=${KOSK}&durum=taslak`);
    const query = Object.fromEntries(new URL(href, "http://x").searchParams);
    expect(filtersOf(query)).toEqual({ kosk: KOSK, status: "DRAFT" });
    expect(coursesHref("a/b", { kosk: null, status: "PUBLISHED" })).toBe(
      "/medrese/a%2Fb/dersler?durum=yayinda"
    );
  });

  it("have the screens they lead to at the addresses the specs propose", () => {
    expect(openCourseHref("m-1")).toBe("/medrese/m-1/dersler/yeni");
    expect(offsiteRequestHref("m-1")).toBe("/medrese/m-1/dersler/talep");
  });

  it("list every köşk that hosts the medrese, then 'tümü' first; the state has two", () => {
    const options = koskOptions(
      [
        { id: "k-1", name: "Nûruosmaniye Köşkü" },
        { id: "k-2", name: "Fatih Köşkü" },
      ],
      t
    );
    expect(options).toEqual([
      { value: "all", label: "Köşk: tümü" },
      { value: "k-1", label: "Köşk: Nûruosmaniye Köşkü" },
      { value: "k-2", label: "Köşk: Fatih Köşkü" },
    ]);
    expect(statusOptions(t).map((o) => o.label)).toEqual([
      "Durum: tümü",
      "Durum: Yayında",
      "Durum: Taslak",
    ]);
  });
});

describe("the counter (nazir 07, criterion 2)", () => {
  it("counts the courses and the köşks they are in", () => {
    const items = [{ koskId: "k-1" }, { koskId: "k-1" }, { koskId: "k-2" }];
    expect(counterOf(items, t)).toBe("3 ders · 2 köşkte");
    expect(counterOf([{ koskId: "K-1" }, { koskId: "k-1" }], t)).toBe(
      "2 ders · 1 köşkte"
    );
  });

  it("follows the filter: a narrower list is a smaller count, an empty one says so", () => {
    expect(counterOf([{ koskId: "k-2" }], t)).toBe("1 ders · 1 köşkte");
    expect(counterOf([], t)).toBe("Gösterilecek ders yok");
  });
});

describe("the Turkish genitive of a name", () => {
  const tr = (name: string) => genitive(name, "tr");

  it("takes its ending from the last vowel, and a buffer n after a vowel", () => {
    expect(tr("Nûruosmaniye Köşkü")).toBe("Nûruosmaniye Köşkü’nün");
    expect(tr("Süleymaniye Medresesi")).toBe("Süleymaniye Medresesi’nin");
    expect(tr("Fatih Köşkü")).toBe("Fatih Köşkü’nün");
    expect(tr("Beyazıt Köşkü")).toBe("Beyazıt Köşkü’nün");
    expect(tr("Hak vermeyen Köşk")).toBe("Hak vermeyen Köşk’ün");
    expect(tr("Yusuf")).toBe("Yusuf’un");
    expect(tr("Kâtip Çelebi")).toBe("Kâtip Çelebi’nin");
    expect(tr("Maksûd Medresesi")).toBe("Maksûd Medresesi’nin");
    expect(tr("İbn Sînâ")).toBe("İbn Sînâ’nın");
    expect(tr("Dar")).toBe("Dar’ın");
  });

  it("leaves a name that ends in no letter, a blank name and another language alone", () => {
    expect(tr("Köşk 2")).toBe("Köşk 2");
    expect(tr("  ")).toBe("");
    expect(genitive("Fatih Köşkü", "en")).toBe("Fatih Köşkü");
  });
});

describe("a course as a row (nazir 07, criteria 3 and 4)", () => {
  const where = {
    locale: "tr",
    timeZone: "Europe/Istanbul",
    now: new Date("2026-10-02T12:00:00+03:00"),
    held: new Set<string>(),
  };
  const rows = (...items: unknown[]) => courseRows(items as never, t, where);

  it("words the köşk beside 'bugün açıldı' by the viewer's day, not the server's", () => {
    // 23:30 on 1 Ekim in Istanbul is 20:30 UTC; 01:30 on 2 Ekim is 22:30 UTC the day before
    const [late, early, older] = rows(
      item({ createdAt: new Date("2026-10-01T20:30:00Z") }),
      item({ createdAt: new Date("2026-10-01T22:30:00Z") }),
      item({ createdAt: new Date("2026-09-20T09:00:00Z") })
    );
    expect(late?.meta).toBe("Nûruosmaniye Köşkü");
    expect(early?.meta).toBe("Nûruosmaniye Köşkü · bugün açıldı");
    expect(older?.meta).toBe("Nûruosmaniye Köşkü");
  });

  it("shows the enrolled talebe and the waiting ones (criterion 3)", () => {
    const [row] = rows(item({ studentCount: 12480, pendingCount: 2 }));
    expect(row?.students).toEqual({
      count: "12.480",
      pending: "2 onay bekliyor",
      none: null,
    });
    const [waiting] = rows(item({ studentCount: 0, pendingCount: 1 }));
    expect(waiting?.students).toEqual({
      count: "0",
      pending: "1 onay bekliyor",
      none: null,
    });
    const [calm] = rows(item({ pendingCount: 0 }));
    expect(calm?.students.pending).toBeNull();
  });

  it("says 'Henüz talebe yok' for a course nobody has joined, and tells a draft from a published one", () => {
    const [published, draft] = rows(
      item({ studentCount: 0, pendingCount: 0 }),
      item({ studentCount: 0, pendingCount: 0, status: "DRAFT" })
    );
    expect(published?.students.none).toBe("published");
    expect(draft?.students.none).toBe("draft");
    expect(t("Courses.noStudents")).toBe("Henüz talebe yok");
  });

  it("names the müderrisler in list order and marks the imam (criterion 4)", () => {
    const [row] = rows(item());
    expect(row?.muderris).toEqual([
      { name: "Mehmet Emin Işıkoğlu", imam: true },
      { name: "Abdülhamit Karaosmanoğlu", imam: false },
    ]);
  });

  it("hands the list to the dialog as the API has it, accounts and müderrisler with none", () => {
    const [row] = rows(
      item({
        muderris: [
          muderris(),
          muderris({
            userId: null,
            name: "Konuk Müderris",
            email: null,
            isImam: false,
          }),
        ],
      })
    );
    expect(row?.team).toEqual([
      {
        userId: "u-1",
        name: "Mehmet Emin Işıkoğlu",
        email: "me@example.com",
        isImam: true,
      },
      { userId: null, name: "Konuk Müderris", email: null, isImam: false },
    ]);
  });

  it("words the state from the API's, and links the course only where the caller holds a scope", () => {
    const [published, draft] = courseRows(
      [item(), item({ id: "C-2", status: "DRAFT" })] as never,
      t,
      { ...where, held: new Set(["c-2"]) }
    );
    expect([published?.statusLabel, draft?.statusLabel]).toEqual([
      "Yayında",
      "Taslak",
    ]);
    expect(published?.href).toBeNull();
    expect(draft?.href).toBe("/ders/C-2");
  });
});

describe("the köşks beside the list and in the choice", () => {
  it("say how many courses the medrese has there, and not the köşk's field (MDRS-252)", () => {
    expect(hostLine({ courseCount: 2 }, t)).toBe("2 medrese dersi");
    expect(hostLine({ courseCount: 0 }, t)).toBe("0 medrese dersi");
    expect(koskChoiceLine({ courseCount: 1 }, t)).toBe(
      "medresenin burada 1 dersi var"
    );
    expect(koskChoiceLine({ courseCount: 0 }, t)).toBe(
      "medresenin burada henüz dersi yok"
    );
    expect(koskChoiceLine({ courseCount: 3 }, t)).toBe(
      "medresenin burada 3 dersi var"
    );
  });
});

describe("the question of Dersi gizle (nazir 18, criterion 1)", () => {
  it("names who the course is hidden from and the köşk's page, with its number of talebe", () => {
    const words = hideWords(
      { koskName: "Nûruosmaniye Köşkü", studentCount: 35 },
      t,
      "tr"
    );
    expect(words).toEqual({
      rest: "talebelerden, ziyaretçilerden ve Nûruosmaniye Köşkü’nün sayfasından gizlenecek; celseleri talebelerin takviminden düşecek.",
      affected: "35 talebe celselere ve ders kayıtlarına erişemez.",
    });
  });

  it("leaves the sentence about talebe out while nobody is enrolled", () => {
    expect(
      hideWords({ koskName: "Fatih Köşkü", studentCount: 0 }, t, "tr").affected
    ).toBeNull();
  });

  it("is the row's own: the number is the course's enrolled count", () => {
    const [row] = courseRows([item({ studentCount: 24 })] as never, t, {
      locale: "tr",
      timeZone: "Europe/Istanbul",
      now: new Date(),
      held: new Set(),
    });
    expect(row?.hide.affected).toBe(
      "24 talebe celselere ve ders kayıtlarına erişemez."
    );
  });
});

describe("the opening form (nazir 08, criteria 2 and 3)", () => {
  const kosks = [{ id: "k-1" }, { id: "k-2" }];
  const team = [
    { userId: "u-1", name: "A", email: null, isImam: false },
    { userId: "u-2", name: "B", email: null, isImam: false },
  ].reduce(
    (acc, member) => teamReducer(acc, { type: "add", member }),
    teamOf([])
  );
  const filled = {
    ...blankForm(kosks),
    title: "Maksûd şerhi",
    team,
  };

  it("starts with the first köşk chosen and everything else empty", () => {
    expect(blankForm(kosks)).toEqual({
      koskId: "k-1",
      title: "",
      team: { members: [], imam: null },
      closed: false,
      approval: false,
    });
    expect(blankForm([]).koskId).toBeNull();
  });

  it("counts a name as the API does: trimmed, from 2 to 200", () => {
    expect(titleProblem("")).toBe("required");
    expect(titleProblem("   ")).toBe("required");
    expect(titleProblem(" a ")).toBe("short");
    expect(titleProblem("Ab")).toBeNull();
    expect(titleProblem("x".repeat(200))).toBeNull();
    expect(titleProblem("x".repeat(201))).toBe("long");
  });

  it("is sendable with a köşk, a name and a list that names its imam", () => {
    expect(openProblems(filled)).toBeNull();
  });

  it("is not sendable without a name or without a müderris, and says which", () => {
    expect(openProblems({ ...filled, title: " " })?.title).toBe("required");
    const blank = openProblems({ ...blankForm(kosks), title: "Ders" });
    expect(blank?.team).toBe("none");
    expect(blank?.title).toBeNull();
    expect(openProblems({ ...filled, koskId: null })?.kosk).toBe(true);
  });

  it("is not sendable with several müderrisler and no imam", () => {
    const three = teamReducer(team, {
      type: "add",
      member: { userId: "u-3", name: "C", email: null, isImam: false },
    });
    // the imam leaves: two remain and nobody is chosen
    const noImam = teamReducer(three, { type: "remove", userId: "u-1" });
    expect(openProblems({ ...filled, team: noImam })?.team).toBe("imam");
  });

  it("sends the name trimmed, the accounts, the imam and the two settings", () => {
    expect(
      openRequest(
        { ...filled, title: "  Maksûd şerhi ", closed: true },
        locksOf(null)
      )
    ).toEqual({
      koskId: "k-1",
      title: "Maksûd şerhi",
      muderrisUserIds: ["u-1", "u-2"],
      imamUserId: "u-1",
      closedCourse: true,
      requiresApproval: false,
    });
  });

  it("sends a setting the medrese's policy fixes as on, whatever the form holds (criterion 5)", () => {
    const locks = locksOf({ closedCourseRequired: true, alwaysApproval: true });
    expect(locks).toEqual({ closed: true, approval: true });
    expect(openRequest(filled, locks)).toMatchObject({
      closedCourse: true,
      requiresApproval: true,
    });
    expect(
      locksOf({ closedCourseRequired: false, alwaysApproval: true })
    ).toEqual({ closed: false, approval: true });
  });

  it("locks nothing when the policies could not be read", () => {
    expect(locksOf(null)).toEqual({ closed: false, approval: false });
  });
});

describe("the message keys built at run time", () => {
  const codes = [
    "HOSTING_RIGHT_REQUIRED",
    "MUDERRIS_UNKNOWN_USER",
    "COURSE_IMAM_REQUIRED",
    "COURSE_IMAM_NOT_LISTED",
    "MUDERRIS_DUPLICATE_USER",
    "VALIDATION_ERROR",
    "MADRASAH_COURSE_NOT_FOUND",
    "MADRASAH_COURSE_ALREADY_HIDDEN",
    "AUTHZ_FORBIDDEN",
    "SOMETHING_NEW",
    "",
  ];
  const locales = ["tr", "en", "ar"] as const;

  it("has a sentence for every code the API sends, in every language", () => {
    for (const locale of locales) {
      const words = translatorFor("nazar", locale);
      for (const code of codes) {
        expect(words.has(courseErrorKey(code)), `${locale} ${code}`).toBe(true);
      }
    }
  });

  it("has the two states and the two filters' words in every language", () => {
    for (const locale of locales) {
      const words = translatorFor("nazar", locale);
      for (const status of ["PUBLISHED", "DRAFT"]) {
        expect(
          words.has(`Courses.status.${status}`),
          `${locale} ${status}`
        ).toBe(true);
        expect(
          words.has(`Courses.filters.status.${status}`),
          `${locale} ${status}`
        ).toBe(true);
      }
      for (const problem of ["required", "short", "long"]) {
        expect(
          words.has(`OpenCourse.nameProblems.${problem}`),
          `${locale} ${problem}`
        ).toBe(true);
      }
    }
  });

  it("keeps the message that carries the köşk's possessive in Turkish only", () => {
    // the other languages put the possessive in the message itself
    expect(resources.tr.nazar.HideCourse.rest).toContain("{koskGenitive}");
    expect(resources.en.nazar.HideCourse.rest).toContain("{kosk}’s");
    expect(resources.tr.nazar.Courses.subtitle).toContain("{nameGenitive}");
    expect(resources.en.nazar.Courses.subtitle).toContain("{name}’s");
  });
});
