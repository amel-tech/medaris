// @vitest-environment happy-dom
import { resources } from "@medaris/i18n";
import { Toaster, ToastProvider } from "@medaris/ui/mds/toast";
import { NextIntlClientProvider } from "next-intl";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  applicationGone,
  applicationRows,
  courseCards,
  decisionErrorKey,
  greetingOf,
  pendingCounts,
  sessionRows,
  sessionTime,
} from "~/features/pano/pano";
import { buildScopes } from "~/features/shell/scope";
import { cleanup, click, render, settle } from "./dom";
import { assignment, course, medrese } from "./fixtures";
import { expand, html, textOf, translatorFor } from "./server-render";

/**
 * The Pano (nazir 01) as the server renders it, the rules behind its numbers
 * and rows, and the two decisions that can be taken on it. The read, the portal
 * and the actions are stubs; what is under test is what the page does with each
 * answer.
 */
type Answer<T> =
  | { status: "ok"; data: T }
  | { status: "forbidden" }
  | { status: "failed" };

const state = {
  dashboard: { status: "failed" } as Answer<unknown>,
  givenName: "Mehmet Emin" as string | undefined,
};
const refresh = vi.fn();
const approveApplication = vi.fn();
const rejectApplication = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));
vi.mock("next-intl/server", () => ({
  getTranslations: async (namespace?: string) => translatorFor(namespace),
  getLocale: async () => "tr",
}));
vi.mock("~/lib/tedrisat-read", () => ({
  readOnce: async () => state.dashboard,
}));
vi.mock("~/features/account/reads", () => ({
  getViewer: async () => ({
    id: "u-me",
    givenName: state.givenName,
    timeZone: "Europe/Istanbul",
  }),
}));

const assignments = [
  medrese(),
  assignment({
    id: "a-1",
    role: "MUDERRIS",
    scopeId: "c-1",
    scopeName: "Bina ve İzhar Şerhi",
    isImam: true,
    course: course({ studentCount: 35 }),
  }),
  assignment({
    id: "a-2",
    role: "MUDERRIS",
    scopeId: "c-2",
    scopeName: "İsâgûcî ile mantığa giriş",
    isImam: false,
    course: course({
      koskId: "k-2",
      koskName: "Fatih Köşkü",
      studentCount: 24,
      status: "DRAFT",
    }),
  }),
];
vi.mock("~/features/shell/reads", () => ({
  getPortal: async () => ({
    status: "ok",
    assignments,
    scopes: buildScopes(assignments),
  }),
}));
vi.mock("~/features/pano/actions", () => ({
  approveApplication: (courseId: string, userId: string) =>
    approveApplication(courseId, userId),
  rejectApplication: (courseId: string, userId: string) =>
    rejectApplication(courseId, userId),
}));

const KOSKS = [
  {
    id: "k-1",
    name: "Nûruosmaniye Köşkü",
    field: "Arapça dil ilimleri",
    courseCount: 1,
  },
  { id: "k-2", name: "Fatih Köşkü", field: "Fıkıh", courseCount: 1 },
];
const session = (over: Record<string, unknown>) => ({
  lessonId: "l-1",
  courseId: "c-2",
  courseTitle: "İsâgûcî ile mantığa giriş",
  courseCoverHue: 210,
  koskId: "k-2",
  koskName: "Fatih Köşkü",
  weekNumber: 2,
  scheduledAt: new Date("2026-10-03T19:00:00+03:00"),
  meetingHost: "meet.google.com",
  ...over,
});
const application = (over: Record<string, unknown>) => ({
  courseId: "c-1",
  courseTitle: "Bina ve İzhar Şerhi",
  userId: "s-1",
  studentName: "Sümeyye Nur Ekincioğlu",
  studentEmail: "sumeyyenur@example.com",
  appliedAt: new Date("2026-09-30T10:00:00+03:00"),
  viewerMayDecide: true,
  ...over,
});

/** The canvas: two sessions ahead, three applications waiting in two courses. */
const dashboard = (over: Record<string, unknown> = {}) => ({
  nazirCount: 3,
  courseCount: 2,
  hostingKosks: KOSKS,
  upcomingSessions: [
    session({}),
    session({
      lessonId: "l-2",
      courseId: "c-1",
      courseTitle: "Bina ve İzhar Şerhi",
      koskId: "k-1",
      koskName: "Nûruosmaniye Köşkü",
      weekNumber: 4,
      scheduledAt: new Date("2026-10-04T21:00:00+03:00"),
      meetingHost: "zoom.us",
    }),
  ],
  pendingApplicationCount: 3,
  pendingCourseCount: 2,
  pendingApplications: [
    application({}),
    application({
      courseId: "c-2",
      courseTitle: "İsâgûcî ile mantığa giriş",
      userId: "s-2",
      studentName: "Ömer Faruk Demirkaya",
    }),
    application({
      courseId: "c-2",
      courseTitle: "İsâgûcî ile mantığa giriş",
      userId: "s-3",
      studentName: "Zeynep Betül Karahanlı",
      appliedAt: new Date("2026-09-28T10:00:00+03:00"),
    }),
  ],
  ...over,
});
const ok = (over?: Record<string, unknown>) => ({
  status: "ok" as const,
  data: dashboard(over),
});

const wrap = (node: React.ReactNode) => (
  <NextIntlClientProvider
    locale="tr"
    timeZone="Europe/Istanbul"
    messages={{ nazir: resources.tr.nazir }}
  >
    <ToastProvider>
      {node}
      <Toaster />
    </ToastProvider>
  </NextIntlClientProvider>
);

const element = async () => {
  const { PanoPage } = await import("~/features/pano/components/pano-page");
  return wrap(<PanoPage madrasahId="m-1" />);
};
const markup = async () => html(await element());
const mount = async () => {
  await render((await expand(await element())) as ReactElement);
  await settle(40);
};
const rowsOf = (out: string, testid: string) =>
  out
    .slice(out.indexOf(`data-testid="${testid}"`))
    .split("<tr")
    .slice(2)
    .map(textOf);
const section = (out: string, id: string) => {
  const start = out.indexOf(`aria-labelledby="${id}"`);
  return out.slice(start, out.indexOf("</section>", start));
};

const toast = (tone: string) =>
  document.querySelector(`.mds-toast--${tone}`)?.textContent ?? "";
const byLabel = (label: string) =>
  document.querySelector(`[aria-label="${label}"]`) as HTMLElement;
const counter = () =>
  document.querySelector("[data-testid=applications-counter]")?.textContent;
const names = () =>
  [...document.querySelectorAll("[data-testid=applications] tbody th")].map(
    (th) => th.textContent
  );

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-02T12:00:00+03:00"));
  state.dashboard = ok();
  state.givenName = "Mehmet Emin";
  for (const fn of [refresh, approveApplication, rejectApplication]) {
    fn.mockReset();
  }
});
afterEach(async () => {
  await cleanup();
  vi.useRealTimers();
});

describe("the rules behind the Pano", () => {
  const t = translatorFor("nazir");
  const where = { locale: "tr", timeZone: "Europe/Istanbul" };

  it("greets by given name and counts the sessions and the applications (criterion 2)", () => {
    expect(greetingOf("Mehmet Emin", { sessions: 2, applications: 3 }, t)).toBe(
      "Selâmün aleyküm, Mehmet Emin Hoca. Önümüzdeki 7 günde 2 celse var; 3 başvuru onayınızı bekliyor."
    );
  });

  it("greets without a name when there is none, and without numbers when the dashboard could not be read", () => {
    expect(greetingOf(undefined, { sessions: 0, applications: 0 }, t)).toBe(
      "Selâmün aleyküm. Önümüzdeki 7 günde 0 celse var; 0 başvuru onayınızı bekliyor."
    );
    expect(greetingOf("  ", null, t)).toBe("Selâmün aleyküm.");
    expect(greetingOf("Mehmet Emin", null, t)).toBe(
      "Selâmün aleyküm, Mehmet Emin Hoca."
    );
  });

  it("prints a session's time the way the canvas does, in the viewer's zone", () => {
    expect(sessionTime(new Date("2026-10-03T19:00:00+03:00"), where)).toBe(
      "3 Eki Cmt 19:00"
    );
    expect(
      sessionTime(new Date("2026-10-03T19:00:00+03:00"), {
        ...where,
        timeZone: "Europe/London",
      })
    ).toBe("3 Eki Cmt 17:00");
  });

  it("resolves the platform from the host, and leaves a celse with no link without one", () => {
    const rows = sessionRows(
      [
        session({ meetingHost: "meet.google.com" }),
        session({ lessonId: "l-2", meetingHost: "zoom.us" }),
        session({ lessonId: "l-3", meetingHost: "toplanti.example.org" }),
        session({ lessonId: "l-4", meetingHost: null }),
      ] as never,
      t,
      { ...where, held: new Set() }
    );
    expect(rows.map((row) => row.platform)).toEqual([
      { id: "google-meet", host: "meet.google.com" },
      { id: "zoom", host: "zoom.us" },
      { id: "unknown", host: "toplanti.example.org" },
      null,
    ]);
  });

  it("keeps the order the API sends, words the week and the köşk, and links 'Düzenle' only where a scope is held", () => {
    const rows = sessionRows(
      [session({}), session({ lessonId: "l-2", courseId: "c-9" })] as never,
      t,
      { ...where, held: new Set(["c-2"]) }
    );
    expect(rows.map((row) => row.key)).toEqual(["l-1", "l-2"]);
    expect(rows[0]).toMatchObject({
      meta: "Hafta 2 · Fatih Köşkü",
      time: { label: "3 Eki Cmt 19:00" },
      editHref: "/ders/c-2/celseler",
    });
    expect(rows[1]?.editHref).toBeNull();
  });

  it("words an application by name, course and day, and keeps who may decide it", () => {
    const rows = applicationRows(
      [
        application({}),
        application({
          userId: "s-4",
          studentName: null,
          studentEmail: "adsiz@example.com",
          viewerMayDecide: false,
          appliedAt: new Date("2025-12-31T10:00:00+03:00"),
        }),
      ] as never,
      t,
      { ...where, now: new Date("2026-10-02T12:00:00+03:00") }
    );
    expect(rows[0]).toMatchObject({
      key: "c-1:s-1",
      name: "Sümeyye Nur Ekincioğlu",
      courseTitle: "Bina ve İzhar Şerhi",
      at: { label: "30 Eyl" },
      mayDecide: true,
    });
    expect(rows[1]).toMatchObject({
      name: "adsiz@example.com",
      at: { label: "31 Ara 2025" },
      mayDecide: false,
    });
  });

  it("counts what is left once some are decided: the courses from the rows when they are all there (criterion 3)", () => {
    const rows = [
      { key: "c-1:s-1", courseId: "c-1" },
      { key: "c-2:s-2", courseId: "c-2" },
      { key: "c-2:s-3", courseId: "c-2" },
    ];
    const pending = { total: 3, courses: 2 };
    expect(pendingCounts(pending, rows, new Set())).toEqual({
      count: 3,
      courses: 2,
    });
    expect(pendingCounts(pending, rows, new Set(["c-1:s-1"]))).toEqual({
      count: 2,
      courses: 1,
    });
    expect(
      pendingCounts(pending, rows, new Set(["c-1:s-1", "c-2:s-2", "c-2:s-3"]))
    ).toEqual({ count: 0, courses: 0 });
  });

  it("counts from the dashboard's own numbers when it holds more applications than it lists", () => {
    const rows = [{ key: "c-1:s-1", courseId: "c-1" }];
    expect(
      pendingCounts({ total: 80, courses: 5 }, rows, new Set(["c-1:s-1"]))
    ).toEqual({ count: 79, courses: 5 });
    expect(pendingCounts({ total: 1, courses: 5 }, [], new Set(["x"]))).toEqual(
      { count: 0, courses: 0 }
    );
  });

  it("words a refusal of a decision, and takes a missing application for one that is gone", () => {
    expect(decisionErrorKey("ENROLLMENT_NOT_FOUND")).toBe(
      "Pano.applications.errors.gone"
    );
    expect(decisionErrorKey("AUTHZ_FORBIDDEN")).toBe(
      "Problems.actionForbidden"
    );
    expect(decisionErrorKey("OTHER")).toBe("Problems.actionGeneric");
    expect(applicationGone("ENROLLMENT_NOT_FOUND")).toBe(true);
    expect(applicationGone("ENROLLMENT_STATE_CONFLICT")).toBe(true);
    expect(applicationGone("AUTHZ_FORBIDDEN")).toBe(false);
  });

  it("makes a card of every course held, with its state, role and köşk (criterion 4)", () => {
    const cards = courseCards(buildScopes(assignments), assignments, t, "tr");
    expect(cards).toEqual([
      expect.objectContaining({
        id: "c-1",
        href: "/ders/c-1",
        state: expect.objectContaining({ label: "Yayında" }),
        role: "Müderris · dersin imamı",
        footer: "Nûruosmaniye Köşkü · 35 talebe",
      }),
      expect.objectContaining({
        id: "c-2",
        state: expect.objectContaining({ label: "Taslak" }),
        role: "Müderris",
        footer: "Fatih Köşkü · 24 talebe",
      }),
    ]);
  });

  it("says Gizli for a hidden course, and has no state or köşk where the API sent no course", () => {
    const hidden = [
      assignment({
        scopeId: "c-7",
        scopeName: "Gizli ders",
        course: course({ hidden: true }),
      }),
      assignment({ id: "a-8", scopeId: "c-8", scopeName: "Bilgisiz ders" }),
    ];
    const cards = courseCards(buildScopes(hidden), hidden, t, "tr");
    expect(cards.find((card) => card.id === "c-7")?.state?.label).toBe("Gizli");
    expect(cards.find((card) => card.id === "c-8")).toMatchObject({
      state: null,
      footer: null,
    });
  });
});

describe("Pano", () => {
  it("is headed and greets, with the numbers the tables hold (criteria 1 and 2)", async () => {
    const out = await markup();
    expect(out).toMatch(/<h1[^>]*>Pano<\/h1>/);
    expect(out).toMatch(
      /data-testid="greeting"[^>]*>Selâmün aleyküm, Mehmet Emin Hoca\. Önümüzdeki 7 günde 2 celse var; 3 başvuru onayınızı bekliyor\./
    );
    expect(rowsOf(out, "applications")).toHaveLength(3);
    expect(section(out, "sessions-heading").split("<tr").length - 2).toBe(2);
  });

  it("has 'Medrese dersi aç' where the medrese has a köşk to open it in", async () => {
    const out = await markup();
    expect(out).toContain('href="/medrese/m-1/dersler/yeni"');
    expect(textOf(out)).toContain("Medrese dersi aç");
  });

  it("turns 'Medrese dersi aç' off where no köşk hosts the medrese", async () => {
    state.dashboard = ok({ hostingKosks: [] });
    const out = await markup();
    expect(out).not.toContain('href="/medrese/m-1/dersler/yeni"');
    expect(out).toMatch(
      /aria-disabled="true"[^>]*>[^<]*(<[^>]*>)*[^<]*Medrese dersi aç/
    );
    expect(textOf(out)).toContain(
      "Henüz hiçbir köşk medresenize barındırma hakkı vermedi."
    );
  });

  it("draws the medrese's card and one for each course held, and no other medrese's (criteria 1 and 4)", async () => {
    const out = await markup();
    const cards = section(out, "scopes-heading");
    const text = textOf(cards);
    expect(text).toContain("Kapsamlarınız");
    expect(text).toContain("Görev aldığınız medrese ve dersler");
    expect(text).toContain("Süleymaniye Medresesi");
    expect(text).toContain("Medrese başmüderrisi");
    expect(text).toContain("3 medrese nazırı");
    expect(text).toContain("2 medrese dersi · 2 köşkte barındırma hakkı");
    expect(text).toContain("Bina ve İzhar Şerhi");
    expect(text).toContain("Yayında");
    expect(text).toContain("Müderris · dersin imamı");
    expect(text).toContain("Nûruosmaniye Köşkü · 35 talebe");
    expect(text).toContain("İsâgûcî ile mantığa giriş");
    expect(text).toContain("Taslak");
    expect(cards).toContain('href="/ders/c-1"');
    expect(cards).toContain('href="/ders/c-2"');
    expect(cards.match(/class="mds-card[ "]/g)).toHaveLength(3);
  });

  it("lists the sessions with week, köşk, time, platform and state, and a way to edit where a scope is held", async () => {
    const out = await markup();
    const sessions = section(out, "sessions-heading");
    const rows = sessions.split("<tr").slice(2).map(textOf);
    expect(rows[0]).toContain(
      "İsâgûcî ile mantığa giriş Hafta 2 · Fatih Köşkü"
    );
    expect(rows[0]).toContain("3 Eki Cmt 19:00");
    expect(rows[0]).toContain("Google Meet");
    expect(rows[0]).toContain("Planlandı");
    expect(rows[0]).toContain("Düzenle");
    expect(rows[1]).toContain("Hafta 4 · Nûruosmaniye Köşkü");
    expect(rows[1]).toContain("4 Eki Paz 21:00");
    expect(rows[1]).toContain("Zoom");
    expect(sessions).toContain('href="/ders/c-2/celseler"');
    expect(sessions).toContain('href="/ders/c-1/celseler"');
  });

  it("says 'Bağlantısı eksik' for a celse with no link, and names an unknown host", async () => {
    state.dashboard = ok({
      upcomingSessions: [
        session({ meetingHost: null }),
        session({ lessonId: "l-2", meetingHost: "toplanti.example.org" }),
      ],
    });
    const rows = section(await markup(), "sessions-heading")
      .split("<tr")
      .slice(2)
      .map(textOf);
    expect(rows[0]).toContain("Bağlantısı eksik");
    expect(rows[1]).toContain("Bilinmeyen platform");
    expect(rows[1]).toContain("toplanti.example.org");
  });

  it("lists the applications with the student, the course and the day, and the counter above them", async () => {
    const out = await markup();
    const rows = rowsOf(out, "applications");
    expect(rows[0]).toContain("Sümeyye Nur Ekincioğlu Bina ve İzhar Şerhi");
    expect(rows[0]).toContain("30 Eyl");
    expect(rows[2]).toContain("Zeynep Betül Karahanlı");
    expect(rows[2]).toContain("28 Eyl");
    expect(out).toMatch(
      /data-testid="applications-counter"[^>]*>3 başvuru · 2 derste</
    );
  });

  it("draws 'Onayla' and 'Reddet' only on the rows the caller may decide (criterion 6 of the contract)", async () => {
    state.dashboard = ok({
      pendingApplications: [
        application({}),
        application({
          userId: "s-2",
          studentName: "Ömer Faruk",
          viewerMayDecide: false,
        }),
      ],
      pendingApplicationCount: 2,
    });
    const rows = rowsOf(await markup(), "applications");
    expect(rows[0]).toContain("Onayla");
    expect(rows[0]).toContain("Reddet");
    expect(rows[1]).not.toContain("Onayla");
    expect(rows[1]).not.toContain("Reddet");
  });

  it("says how many are shown when the dashboard holds more applications than it lists", async () => {
    state.dashboard = ok({ pendingApplicationCount: 80 });
    expect(textOf(await markup())).toContain("En yeni 3 başvuru gösteriliyor.");
  });

  it("lists the köşks that host the medrese, with a way to ask for a course outside it", async () => {
    const out = await markup();
    const hosts = section(out, "hosts-heading");
    expect(textOf(hosts)).toContain(
      "Nûruosmaniye Köşkü Arapça dil ilimleri · 1 medrese dersi"
    );
    expect(textOf(hosts)).toContain("Fatih Köşkü Fıkıh · 1 medrese dersi");
    expect(textOf(hosts)).toContain(
      "Medrese dersleri yalnız bu köşklerde açılır."
    );
    expect(hosts).toContain('href="/medrese/m-1/dersler/talep"');
  });

  it("says in one sentence that nothing is waiting or ahead", async () => {
    state.dashboard = ok({
      upcomingSessions: [],
      pendingApplications: [],
      pendingApplicationCount: 0,
      pendingCourseCount: 0,
    });
    const text = textOf(await markup());
    expect(text).toContain("Önümüzdeki 7 günde celse yok.");
    expect(text).toContain("Bekleyen başvuru yok.");
    expect(text).toContain("0 başvuru · 0 derste");
  });

  it("greets without a given name", async () => {
    state.givenName = undefined;
    expect(textOf(await markup())).toContain(
      "Selâmün aleyküm. Önümüzdeki 7 günde 2 celse var;"
    );
  });

  it("keeps the cards and says so under them when the API refuses, without the tables or 'Medrese dersi aç' (a nazır of the medrese)", async () => {
    state.dashboard = { status: "forbidden" };
    const out = await markup();
    expect(textOf(out)).toContain("Bu sayfaya izniniz yok");
    expect(textOf(section(out, "scopes-heading"))).toContain(
      "Süleymaniye Medresesi"
    );
    expect(textOf(out)).toContain("Selâmün aleyküm, Mehmet Emin Hoca.");
    expect(textOf(out)).not.toContain("Önümüzdeki 7 günde");
    expect(textOf(out)).not.toContain("Medrese dersi aç");
    expect(out).not.toContain('data-testid="applications"');
  });

  it("answers a failed read with the retry state, never with 'izniniz yok'", async () => {
    state.dashboard = { status: "failed" };
    const text = textOf(await markup());
    expect(text).toContain("Pano okunamadı");
    expect(text).toContain("Yeniden dene");
    expect(text).not.toContain("izniniz yok");
  });

  it("draws bars while the dashboard is read", async () => {
    const { PanoLoading } = await import(
      "~/features/pano/components/pano-page"
    );
    const out = await html(<PanoLoading />);
    expect(out).toContain('aria-busy="true"');
    expect(textOf(out)).toBe("Yükleniyor");
  });
});

describe("'Onayla' (criterion 3)", () => {
  it("approves the application, says so, and takes the row and the count away at once", async () => {
    approveApplication.mockResolvedValue({ success: true, data: null });
    await mount();
    expect(counter()).toBe("3 başvuru · 2 derste");
    await click(byLabel("Onayla: Sümeyye Nur Ekincioğlu"));
    await settle(60);

    expect(approveApplication).toHaveBeenCalledExactlyOnceWith("c-1", "s-1");
    expect(toast("success")).toContain("Başvuru onaylandı");
    expect(toast("success")).toContain(
      "Sümeyye Nur Ekincioğlu, “Bina ve İzhar Şerhi” dersine kabul edildi."
    );
    expect(names()).toEqual([
      expect.stringContaining("Ömer Faruk Demirkaya"),
      expect.stringContaining("Zeynep Betül Karahanlı"),
    ]);
    // nothing waits in the first course any more
    expect(counter()).toBe("2 başvuru · 1 derste");
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("keeps the row and says why when the API refuses (a başmüderris who is not the course's müderris)", async () => {
    approveApplication.mockResolvedValue({
      success: false,
      code: "AUTHZ_FORBIDDEN",
    });
    await mount();
    await click(byLabel("Onayla: Sümeyye Nur Ekincioğlu"));
    await settle(60);

    expect(toast("error")).toContain("Başvuru işlenemedi");
    expect(toast("error")).toContain("Bunu yapma izniniz yok.");
    expect(names()).toHaveLength(3);
    expect(counter()).toBe("3 başvuru · 2 derste");
    expect(refresh).not.toHaveBeenCalled();
    expect(
      (
        byLabel("Onayla: Sümeyye Nur Ekincioğlu") as HTMLButtonElement
      ).getAttribute("aria-disabled")
    ).not.toBe("true");
  });

  it("takes an application that is no longer waiting for what it is: it leaves the list with a notice, not an error", async () => {
    approveApplication.mockResolvedValue({
      success: false,
      code: "ENROLLMENT_NOT_FOUND",
    });
    await mount();
    await click(byLabel("Onayla: Sümeyye Nur Ekincioğlu"));
    await settle(60);

    expect(toast("info")).toContain("Bu başvuru artık yok; liste yenilendi.");
    expect(document.querySelector(".mds-toast--error")).toBeNull();
    expect(names()).toHaveLength(2);
    expect(refresh).toHaveBeenCalledOnce();
  });
});

describe("'Reddet'", () => {
  const open = async (name = "Ömer Faruk Demirkaya") => {
    await mount();
    await click(byLabel(`Reddet: ${name}`));
    await settle(80);
  };
  const ask = () =>
    document.querySelector(".mds-dialog[role=alertdialog]") as HTMLElement;
  const button = (label: string) =>
    [...ask().querySelectorAll("button")].find(
      (b) => b.textContent?.trim() === label
    ) as HTMLButtonElement;

  it("asks first, says no reason is taken, and starts its focus on 'Vazgeç'", async () => {
    await open();
    expect(ask()).not.toBeNull();
    expect(ask().textContent).toContain("Başvuru reddedilsin mi?");
    expect(textOf(ask().textContent ?? "")).toContain(
      "Ömer Faruk Demirkaya adlı talebenin “İsâgûcî ile mantığa giriş” dersine başvurusu reddedilecek. Ret için gerekçe alınmaz."
    );
    expect(document.activeElement?.textContent).toBe("Vazgeç");
    expect(rejectApplication).not.toHaveBeenCalled();
  });

  it("does nothing on 'Vazgeç'", async () => {
    await open();
    await click(button("Vazgeç"));
    await settle(60);
    expect(rejectApplication).not.toHaveBeenCalled();
    expect(ask()).toBeNull();
    expect(names()).toHaveLength(3);
  });

  it("rejects the application, says so, and takes the row and the count away", async () => {
    rejectApplication.mockResolvedValue({ success: true, data: null });
    await open();
    await click(button("Reddet"));
    await settle(60);

    expect(rejectApplication).toHaveBeenCalledExactlyOnceWith("c-2", "s-2");
    expect(toast("success")).toContain("Başvuru reddedildi");
    expect(names()).toHaveLength(2);
    expect(counter()).toBe("2 başvuru · 2 derste");
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("keeps the row and says why when the API refuses", async () => {
    rejectApplication.mockResolvedValue({
      success: false,
      code: "AUTHZ_FORBIDDEN",
    });
    await open();
    await click(button("Reddet"));
    await settle(60);
    expect(toast("error")).toContain("Bunu yapma izniniz yok.");
    expect(names()).toHaveLength(3);
  });
});
