// @vitest-environment happy-dom
import { resources } from "@medaris/i18n";
import { Toaster, ToastProvider } from "@medaris/ui/mds/toast";
import { NextIntlClientProvider } from "next-intl";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, click, render, settle } from "./dom";
import { expand, html, textOf, translatorFor } from "./server-render";

/**
 * Ders nazırları of a course (MDRS-270) as the server renders it: who it
 * opens for, and which buttons it draws from the list the API answers. The
 * reads, the viewer and the actions are stubs; what is under test is what the
 * page does with each answer. Hiding a button is not the protection: every
 * one of these has its refusal tested on the API (course-nazirs.e2e.spec.ts).
 */
type Answer<T> =
  | { status: "ok"; data: T }
  | { status: "forbidden" }
  | { status: "failed" };

const state = {
  permissions: { status: "failed" } as Answer<unknown>,
  list: { status: "failed" } as Answer<unknown>,
  viewer: { id: "u-0", timeZone: "Europe/Istanbul" } as unknown,
};
const reads: string[] = [];
const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh, replace: vi.fn(), push: vi.fn() }),
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));
vi.mock("next-intl/server", () => ({
  getTranslations: async (namespace?: string) => translatorFor(namespace),
  getLocale: async () => "tr",
}));
vi.mock("~/lib/tedrisat-read", () => ({
  readOnce: async (what: string, call: (api: unknown) => Promise<unknown>) => {
    reads.push(what);
    await call({
      courses: {
        getMyCoursePermissions: async () => {},
        getCourseNazirs: async () => {},
      },
    });
    if (what.includes("holds in the course")) return state.permissions;
    return state.list;
  },
}));
vi.mock("~/features/account/reads", () => ({
  getViewer: async () => state.viewer,
}));
vi.mock("~/features/course-nazirs/actions", () => ({
  appointCourseNazir: vi.fn(),
  changeCourseNazir: vi.fn(),
  endCourseNazir: vi.fn(),
}));
vi.mock("~/features/nazirs/actions", () => ({ lookupPerson: vi.fn() }));

const CATALOG = [
  "course.edit",
  "session.manage",
  "session.live_link",
  "week.hide",
  "course.settings",
  "course.publish",
  "course.view_unpublished",
  "enrollment.decide",
  "enrollment.remove",
  "enrollment.complete",
  "recording.manage",
  "recording.upload",
  "recording.watch_restricted",
  "session.view_content",
  "question.answer",
  "ban.course",
  "ban.lift_course",
  "deck.manage_course",
  "deck.propose_kosk",
  "course_nazir.assign",
];

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
const FATMA = person("u-1", "Fatma Zehra Çelebioğlu", "fz@example.com");
const AHMED = person("u-2", "Ahmed Faruk Yılmaz", "a.yilmaz@example.com");

const post = (over: Record<string, unknown> = {}) => ({
  id: "p-1",
  user: FATMA,
  permissions: ["session.manage", "recording.manage"],
  endsAt: new Date("2026-12-31T20:59:00Z"),
  grantedBy: MUDERRIS,
  grantedAt: new Date("2026-09-30T09:00:00Z"),
  mayEdit: true,
  mayEnd: true,
  ...over,
});

/** What `GET /courses/:id/nazirs` answers a müderris; a spec overrides what it is about. */
const list = (over: Record<string, unknown> = {}): Answer<unknown> => ({
  status: "ok",
  data: {
    course: { id: "c-1", title: "Bina ve İzhar Şerhi", madrasahName: null },
    items: [
      post(),
      post({
        id: "p-2",
        user: AHMED,
        permissions: [],
        endsAt: null,
        grantedAt: new Date("2026-10-01T09:00:00Z"),
      }),
    ],
    catalog: CATALOG,
    grantable: CATALOG,
    mayAppoint: true,
    ...over,
  },
});

/** What the caller holds in the course, as `GET /courses/:id/my-permissions` answers. */
const holding = (...codes: string[]): Answer<unknown> => ({
  status: "ok",
  data: { permissions: ["course.view", ...codes], staffRead: false },
});

const wrap = (node: React.ReactNode) => (
  <NextIntlClientProvider
    locale="tr"
    timeZone="Europe/Istanbul"
    messages={{ nazar: resources.tr.nazar }}
  >
    <ToastProvider>
      {node}
      <Toaster />
    </ToastProvider>
  </NextIntlClientProvider>
);

const element = async () => {
  const { CourseNazirsPage } = await import(
    "~/features/course-nazirs/components/course-nazirs-page"
  );
  return wrap(<CourseNazirsPage courseId="c-1" />);
};
const markup = async () => html(await element());
const mount = async () => {
  await render((await expand(await element())) as ReactElement);
  await settle(40);
};

/** The opening tag of the button with this accessible name, or "" when it is not drawn. */
const buttonTag = (out: string, label: string) =>
  new RegExp(`<button[^>]*aria-label="${label}"[^>]*>`).exec(out)?.[0] ?? "";
const rowOf = (out: string, name: string) =>
  out
    .split("<tr")
    .slice(1)
    .find((row) => textOf(row).includes(name)) ?? "";
const listRead = () => reads.some((what) => what.includes("ders nazırları"));
const dialog = () => document.querySelector(".mds-dialog") as HTMLElement;
const byLabel = (label: string) =>
  document.querySelector(`[aria-label="${label}"]`) as HTMLElement;
const buttonIn = (root: ParentNode, label: string) =>
  [...root.querySelectorAll("button")].find(
    (b) => b.textContent?.trim() === label
  ) as HTMLButtonElement;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-05T10:00:00+03:00"));
  state.permissions = holding("course_nazir.assign", "permission.grant");
  state.list = list();
  state.viewer = { id: "u-0", timeZone: "Europe/Istanbul" };
  reads.length = 0;
  refresh.mockReset();
});
afterEach(async () => {
  await cleanup();
  vi.useRealTimers();
});

describe("Ders nazırları", () => {
  it("is headed with the course and lists each post with its permissions, end and appointer", async () => {
    const out = await markup();
    expect(out).toMatch(/<h1[^>]*>Ders nazırları<\/h1>/);
    const text = textOf(out);
    expect(text).toContain(
      "Bina ve İzhar Şerhi dersinin ders nazırları. Ders nazırı yalnız kendisine verilen izinlerle çalışır; görev ve izinler aynı anda biter."
    );
    expect(text).not.toContain("Ders nazırı atayabilirsiniz.");

    const fatma = textOf(rowOf(out, "Fatma Zehra Çelebioğlu"));
    expect(fatma).toContain("fz@example.com");
    expect(fatma).toContain("2 izin");
    expect(fatma).toContain(
      "Celse ekle, tarihini değiştir, iptal et; toplantı bağlantısını gir · Ders kaydı ekle, adlandır, gizle; görünürlüğünü değiştir"
    );
    expect(fatma).toContain("31 Aralık 2026");
    expect(fatma).toContain("Mehmet Emin Işıkoğlu (siz)");
    expect(fatma).toContain("30 Eylül 2026");

    const ahmed = textOf(rowOf(out, "Ahmed Faruk Yılmaz"));
    expect(ahmed).toContain("İzin yok");
    expect(ahmed).toContain("Süresiz");
  });

  it("writes the end on the viewer's clock", async () => {
    state.viewer = { id: "u-0", timeZone: "America/New_York" };
    expect(textOf(rowOf(await markup(), "Fatma"))).toContain("31 Aralık 2026");
    state.list = list({
      items: [post({ endsAt: new Date("2027-01-01T02:00:00Z") })],
    });
    expect(textOf(rowOf(await markup(), "Fatma"))).toContain("31 Aralık 2026");
    state.viewer = { id: "u-0", timeZone: "Europe/Istanbul" };
    expect(textOf(rowOf(await markup(), "Fatma"))).toContain("1 Ocak 2027");
  });

  it("says the course has no ders nazırı yet", async () => {
    state.list = list({ items: [] });
    expect(textOf(await markup())).toContain(
      "Bu derste henüz ders nazırı yok."
    );
  });

  it("is 'Bu sayfaya izniniz yok' for every code set without course_nazir.assign, however much else", async () => {
    for (const held of [
      [],
      ["course.view_details", "course.staff_read"],
      [
        "permission.grant",
        ...CATALOG.filter((code) => code !== "course_nazir.assign"),
        "course_nazir.assign_kosk",
        "course.manage_all",
      ],
    ]) {
      state.permissions = holding(...held);
      const out = textOf(await markup());
      expect(out, held.join()).toContain("Bu sayfaya izniniz yok");
      expect(out).not.toContain("Ders nazırı ata");
      expect(out).not.toContain("Fatma Zehra Çelebioğlu");
    }
  });

  it("is that state when the permissions read or the list read is refused", async () => {
    state.permissions = { status: "forbidden" };
    expect(textOf(await markup())).toContain("Bu sayfaya izniniz yok");
    state.permissions = holding("course_nazir.assign");
    state.list = { status: "forbidden" };
    expect(textOf(await markup())).toContain("Bu sayfaya izniniz yok");
  });

  it("reads no list for a caller it turns away", async () => {
    for (const permissions of [
      holding("course.edit"),
      { status: "forbidden" } as const,
      { status: "failed" } as const,
    ]) {
      state.permissions = permissions;
      reads.length = 0;
      await markup();
      expect(listRead(), permissions.status).toBe(false);
    }
    state.permissions = holding("course_nazir.assign");
    await markup();
    expect(listRead()).toBe(true);
  });

  it("is the retry state, never 'izniniz yok', when a read failed", async () => {
    for (const failed of ["permissions", "list"] as const) {
      state.permissions = holding("course_nazir.assign");
      state.list = list();
      state[failed] = { status: "failed" };
      const out = textOf(await markup());
      expect(out, failed).toContain("Ders nazırları yüklenemedi");
      expect(out, failed).toContain("Yeniden dene");
      expect(out, failed).not.toContain("izniniz yok");
      expect(out, failed).not.toContain("Ders nazırı ata");
    }
  });

  it("draws 'Ders nazırı ata' only when the list says the caller may appoint", async () => {
    expect(textOf(await markup())).toContain("Ders nazırı ata");
    state.list = list({ mayAppoint: false, grantable: [] });
    const out = textOf(await markup());
    expect(out).not.toContain("Ders nazırı ata");
    // the list is still shown to one who may read it
    expect(out).toContain("Fatma Zehra Çelebioğlu");
  });

  it("says an appointer appoints only", async () => {
    state.list = list({ grantable: [] });
    const out = textOf(await markup());
    expect(out).toContain(
      "Ders nazırı atayabilirsiniz. Atadığınız kişi izinsiz başlar; izinleri dersin müderrisi verir."
    );
    expect(out).toContain("Ders nazırı ata");
  });

  it("draws no 'İzinleri düzenle' where the row says no, the viewer's own row included", async () => {
    state.viewer = { id: "u-1", timeZone: "Europe/Istanbul" };
    state.list = list({
      items: [
        post({ mayEdit: false, mayEnd: false }),
        post({ id: "p-2", user: AHMED, mayEdit: true }),
      ],
    });
    const out = await markup();
    expect(textOf(rowOf(out, "Fatma"))).toContain(
      "Fatma Zehra Çelebioğlu (siz)"
    );
    expect(buttonTag(out, "İzinleri düzenle: Fatma Zehra Çelebioğlu")).toBe("");
    expect(buttonTag(out, "Görevden al: Fatma Zehra Çelebioğlu")).toBe("");
    expect(buttonTag(out, "İzinleri düzenle: Ahmed Faruk Yılmaz")).not.toBe("");
  });

  it("draws 'Görevden al' only on the rows the caller may end, and holds it while the row has appointees", async () => {
    state.list = list({
      grantable: [],
      items: [
        post({ mayEdit: false, mayEnd: false }),
        post({
          id: "p-2",
          user: AHMED,
          grantedBy: FATMA,
          mayEdit: false,
          mayEnd: true,
        }),
      ],
    });
    let out = await markup();
    expect(buttonTag(out, "Görevden al: Fatma Zehra Çelebioğlu")).toBe("");
    expect(buttonTag(out, "İzinleri düzenle: Ahmed Faruk Yılmaz")).toBe("");
    expect(buttonTag(out, "Görevden al: Ahmed Faruk Yılmaz")).not.toBe("");
    expect(buttonTag(out, "Görevden al: Ahmed Faruk Yılmaz")).not.toContain(
      "disabled"
    );

    // the müderris may end both, but Fatma only after the post she appointed
    state.list = list({
      items: [post(), post({ id: "p-2", user: AHMED, grantedBy: FATMA })],
    });
    out = await markup();
    const held = buttonTag(out, "Görevden al: Fatma Zehra Çelebioğlu");
    expect(held).toContain("disabled");
    expect(held).toContain('aria-describedby="end-blocked-p-1"');
    expect(textOf(rowOf(out, "Fatma"))).toContain(
      "Önce bu kişinin atadığı 1 ders nazırını görevden alın."
    );
    expect(buttonTag(out, "Görevden al: Ahmed Faruk Yılmaz")).not.toContain(
      "disabled"
    );
  });

  it("opens the appointment, the permission editor and the dismissal from the page", async () => {
    await mount();
    await click(buttonIn(document.body, "Ders nazırı ata"));
    await settle(60);
    expect(dialog().textContent).toContain("Bina ve İzhar Şerhi");
    expect(dialog().querySelector("input[type=email]")).not.toBeNull();
    await click(buttonIn(dialog(), "Vazgeç"));
    await settle(60);

    await click(byLabel("İzinleri düzenle: Fatma Zehra Çelebioğlu"));
    await settle(60);
    expect(dialog().textContent).toContain("Fatma Zehra Çelebioğlu");
    expect(dialog().querySelectorAll("[role=checkbox]")).toHaveLength(20);
    await click(buttonIn(dialog(), "Vazgeç"));
    await settle(60);

    await click(byLabel("Görevden al: Ahmed Faruk Yılmaz"));
    await settle(60);
    expect(dialog().textContent).toContain(
      "Ahmed Faruk Yılmaz, Bina ve İzhar Şerhi dersindeki ders nazırlığından alınacak."
    );
  });

  it("is bars while the list is read", async () => {
    const { CourseNazirsLoading } = await import(
      "~/features/course-nazirs/components/course-nazirs-page"
    );
    const out = await html(<CourseNazirsLoading />);
    expect(out).toContain('aria-busy="true"');
    expect(textOf(out)).toBe("Yükleniyor");
  });
});

describe("the route", () => {
  it("names the tab 'Ders nazırları' and renders the page for its course", async () => {
    const route = await import("../app/ders/[dersId]/nazirlar/page");
    expect(await route.generateMetadata()).toEqual({
      title: "Ders nazırları",
    });
    const page = (await route.default({
      params: Promise.resolve({ dersId: "c-1" }),
    })) as ReactElement<{ courseId: string }>;
    expect(page.props.courseId).toBe("c-1");
  });
});
