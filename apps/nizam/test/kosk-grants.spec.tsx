import { resources } from "@medaris/i18n";
import type {
  KoskGrantCourseResponse,
  KoskGrantResponse,
  KoskGrantsResponse,
} from "@medaris/services/tedrisat";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { GrantsView } from "~/features/grants/components/grants-view";
import {
  canSaveGrant,
  courseCodeKey,
  freeCourses,
  grantErrorKey,
  madrasahCourseNote,
  orderCodes,
  permissionSummary,
} from "~/features/grants/present";

// The server actions reach for the session and the API, and the router needs
// a mounted app; none of them runs in a render.
vi.mock("~/features/grants/actions", () => ({
  createGrant: vi.fn(),
  updateGrant: vi.fn(),
  revokeGrant: vi.fn(),
}));
vi.mock("~/features/madrasahs/actions", () => ({
  lookupUserByEmail: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

const IST = "Europe/Istanbul";

const ORDER = [
  "course.edit",
  "session.manage",
  "session.live_link",
  "week.hide",
  "enrollment.decide",
  "enrollment.complete",
  "recording.manage",
  "ban.course",
];
const nameOf = (code: string) => `<${code}>`;

describe("the summary of a post's permissions (nizam/38)", () => {
  it("counts them and names them in the order the dialog draws them", () => {
    expect(
      permissionSummary(
        ["ban.course", "session.manage", "course.edit", "session.manage"],
        ORDER,
        nameOf
      )
    ).toEqual({
      count: 3,
      names: "<course.edit>, <session.manage>, <ban.course>",
    });
  });

  it("puts a code the order does not know last, and has no names for none", () => {
    expect(orderCodes(["x.unknown", "course.edit"], ORDER)).toEqual([
      "course.edit",
      "x.unknown",
    ]);
    expect(permissionSummary([], ORDER, nameOf)).toEqual({
      count: 0,
      names: "",
    });
  });

  it("turns a code into a message key that does not nest", () => {
    expect(courseCodeKey("session.live_link")).toBe("session_live_link");
  });
});

describe("which courses a ders nazırı can be made in", () => {
  const courses: KoskGrantCourseResponse[] = [
    { id: "c1", title: "Emsile ve Bina", madrasahName: null },
    {
      id: "c2",
      title: "Bina ve İzhar Şerhi",
      madrasahName: "Süleymaniye Medresesi",
    },
    { id: "c3", title: "Maksûd şerhi", madrasahName: "Süleymaniye Medresesi" },
  ];

  it("offers only the medrese-free ones", () => {
    expect(freeCourses(courses).map((c) => c.id)).toEqual(["c1"]);
  });

  it("counts a missing medrese name as no medrese: the generated client turns null into undefined", () => {
    const fromJson = [
      { id: "c1", title: "Emsile ve Bina" },
      { id: "c2", title: "Nahiv", madrasahName: undefined },
    ] as KoskGrantCourseResponse[];
    expect(freeCourses(fromJson).map((c) => c.id)).toEqual(["c1", "c2"]);
    expect(madrasahCourseNote(fromJson).titles).toEqual([]);
  });

  it("names the medrese courses and their medreses once each for the note", () => {
    expect(madrasahCourseNote(courses)).toEqual({
      titles: ["Bina ve İzhar Şerhi", "Maksûd şerhi"],
      madrasahs: ["Süleymaniye Medresesi"],
    });
  });
});

describe("saving a post", () => {
  const base = {
    editing: false,
    personChosen: true,
    courseChosen: true,
    permissionCount: 2,
    endProblem: null,
  };

  it("needs a person, a course and at least one permission", () => {
    expect(canSaveGrant(base)).toBe(true);
    expect(canSaveGrant({ ...base, personChosen: false })).toBe(false);
    expect(canSaveGrant({ ...base, courseChosen: false })).toBe(false);
    expect(canSaveGrant({ ...base, permissionCount: 0 })).toBe(false);
  });

  it("needs neither person nor course when a post is edited", () => {
    expect(
      canSaveGrant({
        ...base,
        editing: true,
        personChosen: false,
        courseChosen: false,
      })
    ).toBe(true);
  });

  it("is off while the end date is wrong", () => {
    expect(canSaveGrant({ ...base, endProblem: "past" })).toBe(false);
  });
});

describe("the refusals' sentences", () => {
  it("maps the API's codes to the page's messages and everything else to the generic one", () => {
    expect(grantErrorKey({ code: "GRANT_EXCEEDS_GIVER" })).toBe(
      "errors.exceeds"
    );
    expect(grantErrorKey({ code: "COURSE_NAZIR_EXISTS" })).toBe(
      "errors.exists"
    );
    expect(grantErrorKey({ code: "GRANT_EXPIRY_INVALID" })).toBe(
      "errors.expiryInvalid"
    );
    expect(grantErrorKey({ code: "WHATEVER" })).toBe("errors.generic");
    expect(grantErrorKey(undefined)).toBe("errors.generic");
  });

  it("has a sentence for each of them, in all three languages", () => {
    for (const lang of ["tr", "en", "ar"] as const) {
      const errors = (
        resources[lang].nizam as unknown as {
          KoskGrantsPage: { errors: Record<string, string> };
        }
      ).KoskGrantsPage.errors;
      for (const key of [
        "generic",
        "exceeds",
        "unknownPermission",
        "courseInvalid",
        "exists",
        "notFound",
        "expiryInvalid",
        "unknownAccount",
        "forbidden",
      ]) {
        expect(errors[key], `${lang} ${key}`).toBeTruthy();
      }
    }
  });
});

const render = (ui: React.ReactElement) =>
  renderToStaticMarkup(
    <NextIntlClientProvider
      locale="tr"
      timeZone={IST}
      messages={{ nizam: resources.tr.nizam } as never}
    >
      {ui}
    </NextIntlClientProvider>
  );

const grant: KoskGrantResponse = {
  id: "p1",
  user: {
    id: "u1",
    name: "Yusuf Kerem Aydınoğlu",
    email: "yusufkerem.aydinoglu@example.com",
  },
  course: { id: "c1", title: "Emsile ve Bina", madrasahName: null },
  permissions: [
    "session.manage",
    "session.live_link",
    "week.hide",
    "enrollment.decide",
    "enrollment.complete",
    "recording.manage",
    "session.view_content",
    "ban.course",
  ],
  endsAt: new Date("2026-12-31T20:59:59Z"),
  grantedBy: { id: "me", name: "Abdülhamit Karaosmanoğlu", email: null },
  grantedAt: new Date("2026-09-14T09:00:00Z"),
};

const data: KoskGrantsResponse = {
  items: [grant],
  courses: [
    { id: "c1", title: "Emsile ve Bina", madrasahName: null },
    {
      id: "c2",
      title: "Maksûd şerhi",
      madrasahName: "Süleymaniye Medresesi",
    },
  ],
  grantable: ["course.edit", "session.manage", "ban.course"],
};

describe("GrantsView (nizam 38)", () => {
  const view = (d: KoskGrantsResponse | null = data) =>
    render(<GrantsView koskId="k1" data={d} viewerId="me" />);

  it("draws the title, 'Ders nazırı ata', the count and a row with person, course, summary, end and giver (criterion 1)", () => {
    const html = view();
    expect(html).toContain("<h1");
    expect(html).toContain("İzinler");
    expect(html).toContain("Ders nazırı ata");
    expect(html).toContain("Atanmış ders nazırları");
    expect(html).toContain("1 kişi");
    expect(html).toContain("Yusuf Kerem Aydınoğlu");
    expect(html).toContain("yusufkerem.aydinoglu@example.com");
    expect(html).toContain("Emsile ve Bina");
    expect(html).toContain("8 izin");
    expect(html).toContain("31 Aralık 2026");
    expect(html).toContain("Görev ve izinler aynı gün biter.");
  });

  it("says 'siz' after the viewer's own name as the giver and gives the date", () => {
    const html = view();
    expect(html).toContain("Abdülhamit Karaosmanoğlu (siz)");
    expect(html).toContain("14 Eylül 2026");
  });

  it("names the medrese courses in a note that says the medrese gives the permission", () => {
    const html = view();
    expect(html).toContain("Maksûd şerhi");
    expect(html).toContain("medrese kadrosu verir");
  });

  it("has no note when the köşk hosts no medrese course", () => {
    const html = view({
      ...data,
      courses: [{ id: "c1", title: "Emsile ve Bina", madrasahName: null }],
    });
    expect(html).not.toContain("medrese kadrosu verir");
  });

  it("names the edit and dismiss buttons for the person, and keeps 'Görevden al' shut before the gate (criterion 4)", () => {
    const html = view();
    expect(html).toContain(
      'aria-label="İzinleri düzenle: Yusuf Kerem Aydınoğlu"'
    );
    const dismiss = html.slice(
      html.indexOf('aria-label="Görevden al: Yusuf Kerem Aydınoğlu"') - 400,
      html.indexOf('aria-label="Görevden al: Yusuf Kerem Aydınoğlu"') + 80
    );
    // Static markup has not run the client's clock: the gate is closed.
    expect(dismiss).toContain("disabled");
  });

  it("offers no 'İzinleri düzenle' on the viewer's own post, which the API refuses, but keeps it for the başnazım (MDRS-108)", () => {
    const own = {
      ...data,
      items: [{ ...grant, user: { ...grant.user, id: "ME" } }],
    };
    const edit = 'aria-label="İzinleri düzenle: Yusuf Kerem Aydınoğlu"';
    const html = view(own);
    expect(html).not.toContain(edit);
    expect(html).toContain('aria-label="Görevden al: Yusuf Kerem Aydınoğlu"');
    expect(
      render(<GrantsView koskId="k1" data={own} viewerId="me" viewerIsChief />)
    ).toContain(edit);
  });

  it("says there is none yet when the list is empty", () => {
    expect(view({ ...data, items: [] })).toContain("Henüz ders nazırı yok.");
  });

  it("shows the error state and keeps 'Ders nazırı ata' off when the read failed", () => {
    const html = view(null);
    expect(html).toContain("Ders nazırları yüklenemedi");
    expect(html).toContain("Yeniden dene");
  });
});
