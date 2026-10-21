// @vitest-environment happy-dom
import { resources } from "@medaris/i18n";
import { Toaster, ToastProvider } from "@medaris/ui/mds/toast";
import { NextIntlClientProvider } from "next-intl";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ALL_SESSIONS,
  changedLabel,
  homeworkCounts,
  homeworkHref,
  homeworkSessions,
  noteExcerpt,
  reviewStatus,
  shownSessions,
} from "~/features/homework/homework";
import { cleanup, click, render, settle, type as typeInto } from "./dom";
import { expand, html, textOf, translatorFor } from "./server-render";

/**
 * Ödevler of a course (MDRS-290) as the server renders it: who may open it,
 * a table per celse with the talebe, their files, the last change on the
 * course's clock and their note, the celse filter, and its empty states. The
 * reads are stubs; what is under test is what the page does with each answer.
 */
type Answer<T> =
  | { status: "ok"; data: T }
  | { status: "forbidden" }
  | { status: "failed" };

const state = {
  course: { status: "failed" } as Answer<unknown>,
  permissions: { status: "failed" } as Answer<unknown>,
  submissions: { status: "failed" } as Answer<unknown>,
};
const asked: string[] = [];
const actions = vi.hoisted(() => ({
  sendSubmissionReview: vi.fn(),
  deleteSubmissionReviewFile: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), replace: vi.fn(), push: vi.fn() }),
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));
vi.mock("~/features/homework/actions", () => actions);
vi.mock("~/lib/unauthenticated", () => ({
  handleUnauthenticated: (result: unknown) =>
    result !== null &&
    typeof result === "object" &&
    (result as { kind?: unknown }).kind === "unauthenticated",
}));
vi.mock("next-intl/server", () => ({
  getTranslations: async (namespace?: string) => translatorFor(namespace),
  getLocale: async () => "tr",
}));
vi.mock("~/lib/tedrisat-read", () => ({
  readOnce: async (what: string, call: (api: unknown) => Promise<unknown>) => {
    await call({
      courses: {
        getCourseById: async () => {},
        getMyCoursePermissions: async () => {},
      },
      submissions: {
        listCourseSubmissions: async (request: { id: string }) => {
          asked.push(request.id);
        },
      },
    });
    if (what.includes("holds in the course")) return state.permissions;
    if (what.includes("homework")) return state.submissions;
    return state.course;
  },
}));

const lesson = (id: string, title: string, at: string, over = {}) => ({
  id,
  title,
  type: "LIVE",
  scheduledAt: new Date(at),
  cancelledAt: null,
  ...over,
});

const course = (over: Record<string, unknown> = {}) => ({
  id: "c-1",
  title: "Bina ve İzhar Şerhi",
  version: 7,
  timeZone: "Europe/Istanbul",
  weeks: [
    {
      id: "w1",
      weekNumber: 1,
      title: "Birinci hafta",
      lessons: [
        lesson("l-1", "Fiil çekimi", "2026-09-28T21:00:00+03:00"),
        lesson("l-2", "Mastar", "2026-09-30T21:00:00+03:00"),
      ],
    },
    {
      id: "w2",
      weekNumber: 2,
      title: "İkinci hafta",
      lessons: [
        lesson("l-3", "Emsile", "2026-10-05T21:00:00+03:00"),
        lesson("l-4", "İptal", "2026-10-07T21:00:00+03:00", {
          cancelledAt: new Date("2026-10-01T10:00:00+03:00"),
        }),
      ],
    },
  ],
  ...over,
});

const LONG_NOTE =
  "Hocam, ödevin ilk kısmını yaptım; ikinci kısımdaki mastar çekimlerinde emin olamadığım yerler var. Özellikle ef'al babının mastarlarında kuralı tam oturtamadım, düzeltmelerinizi bekliyorum.";

const submission = (over: Record<string, unknown> = {}) => ({
  id: "s-1",
  lessonId: "l-1",
  note: null,
  createdAt: new Date("2026-09-29T09:00:00Z"),
  updatedAt: new Date("2026-09-29T18:30:00Z"),
  files: [
    {
      id: "f-1",
      name: "odev-1.pdf",
      contentType: "application/pdf",
      sizeBytes: 1_258_291,
      createdAt: new Date("2026-09-29T09:00:00Z"),
      downloadUrl: "/courses/c-1/submissions/files/f-1",
    },
  ],
  lessonTitle: "Fiil çekimi",
  weekNumber: 1,
  talebe: { id: "u-5", name: "Ayşe Nur Demir" },
  review: null,
  ...over,
});

/** A review sent at `at` by the müderris, with one corrected file. */
const sentReview = (at: string, note: string | null = "Güzel olmuş.") => ({
  note,
  reviewedAt: new Date(at),
  reviewer: { id: "u-1", name: "Yunus Emre Kandemir" },
  files: [
    {
      id: "rf-1",
      name: "duzeltilmis.pdf",
      contentType: "application/pdf",
      sizeBytes: 2048,
      createdAt: new Date(at),
      downloadUrl: "/courses/c-1/submissions/review-files/rf-1",
    },
  ],
});

/** As tedrisat lists them: programme order, the latest change first within a celse. */
const items = () => [
  submission(),
  submission({
    id: "s-2",
    talebe: { id: "u-6", name: null },
    note: "Kısa not.",
    updatedAt: new Date("2026-09-29T07:00:00Z"),
    files: [],
  }),
  submission({
    id: "s-3",
    lessonId: "l-3",
    lessonTitle: "Emsile",
    weekNumber: 2,
    talebe: { id: "u-7", name: "Yusuf Kaya" },
    note: LONG_NOTE,
    files: [
      {
        id: "f-3",
        name: "emsile.docx",
        contentType:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        sizeBytes: 860_160,
        createdAt: new Date("2026-10-05T10:00:00Z"),
        downloadUrl: "/courses/c-1/submissions/files/f-3",
      },
    ],
  }),
];

/**
 * tedrisat's count beside the homework: which live celse has homework set,
 * and how many of the three enrolled talebe handed in on it.
 */
const counts = (over: Record<string, Record<string, unknown>> = {}) => ({
  talebeCount: 3,
  sessions: [
    { lessonId: "l-1", hasAssignment: true, handedInCount: 2 },
    { lessonId: "l-2", hasAssignment: false, handedInCount: 0 },
    { lessonId: "l-3", hasAssignment: true, handedInCount: 1 },
    { lessonId: "l-4", hasAssignment: false, handedInCount: 0 },
  ].map((session) => ({ ...session, ...over[session.lessonId] })),
});
const answer = (
  list: unknown[] = items(),
  over: Record<string, Record<string, unknown>> = {}
) => ({ items: list, ...counts(over) });

const holding = (...codes: string[]): Answer<unknown> => ({
  status: "ok",
  data: { permissions: ["course.view", ...codes], staffRead: true },
});

const element = async () => {
  const { HomeworkPage } = await import(
    "~/features/homework/components/homework-page"
  );
  return (
    <NextIntlClientProvider
      locale="tr"
      timeZone="Europe/Istanbul"
      messages={{ nazar: resources.tr.nazar }}
    >
      {/* The app's root holds the toasts (AppProviders). */}
      <ToastProvider>
        <HomeworkPage courseId="c-1" />
        <Toaster />
      </ToastProvider>
    </NextIntlClientProvider>
  );
};
const markup = async () => html(await element());
const mount = async () => {
  await render((await expand(await element())) as ReactElement);
  await settle(40);
};
const table = (lessonId: string) =>
  document.querySelector(
    `[data-testid="homework-${lessonId}"]`
  ) as HTMLElement | null;
const rows = (lessonId: string) => [
  ...(table(lessonId)?.querySelectorAll("tbody tr") ?? []),
];
const choose = async (label: string, option: string) => {
  await click(document.querySelector(`[aria-label="${label}"]`) as HTMLElement);
  await settle(40);
  const row = [...document.querySelectorAll("[role=option]")].find(
    (o) => o.textContent?.trim() === option
  );
  if (!row) throw new Error(`no option ${option}`);
  await click(row);
  await settle(40);
};

beforeEach(() => {
  actions.sendSubmissionReview.mockReset();
  actions.deleteSubmissionReviewFile.mockReset();
  state.course = { status: "ok", data: course() };
  state.permissions = holding("submission.read");
  state.submissions = { status: "ok", data: answer() };
  asked.length = 0;
});
afterEach(async () => {
  await cleanup();
  window.history.replaceState(null, "", "/");
});

describe("Ödevler", () => {
  it("is headed with the course and reads its homework", async () => {
    const out = await markup();
    expect(out).toMatch(/<h1[^>]*>Ödevler<\/h1>/);
    expect(textOf(out)).toContain(
      "Bina ve İzhar Şerhi dersinde talebelerin celselere teslim ettiği ödevler."
    );
    expect(asked).toContain("c-1");
    expect(homeworkHref("c 1")).toBe("/ders/c%201/odevler");
  });

  it("draws a table per celse that holds homework, in programme order", async () => {
    await mount();
    const headings = [...document.querySelectorAll("h2")].map((h) =>
      h.textContent?.trim()
    );
    expect(headings).toEqual(["Hafta 1 · Fiil çekimi", "Hafta 2 · Emsile"]);
    expect(table("l-2")).toBeNull();
    expect(
      document.querySelector('[data-testid="homework-counts"]')?.textContent
    ).toContain("3 ödev · 2 celse");
    expect(document.body.textContent).toContain(
      "Saatler dersin saat dilimiyle (İstanbul)"
    );
  });

  it("lists each talebe with their files as download links, the last change on the course's clock, and the note", async () => {
    await mount();
    const [first, second] = rows("l-1");
    expect(first?.textContent).toContain("Ayşe Nur Demir");
    const link = first?.querySelector(
      "a[href^='/api/files/']"
    ) as HTMLAnchorElement;
    expect(link.getAttribute("href")).toBe(
      "/api/files/courses/c-1/submissions/f-1"
    );
    // A plain link: a refusal comes back to the page with ?fileError=.
    expect(link.hasAttribute("download")).toBe(false);
    expect(link.textContent).toBe("odev-1.pdf");
    expect(first?.textContent).toContain("PDF");
    expect(first?.textContent).toContain("1,2 MB");
    // 18:30 UTC is 21:30 in Istanbul
    expect(first?.querySelector("time")?.textContent).toBe("29 Eyl 2026 21:30");
    expect(second?.textContent).toContain("Adı bilinmeyen talebe");
    expect(second?.textContent).toContain("Dosya yok");
    expect(second?.textContent).toContain("Kısa not.");
    expect(rows("l-3")[0]?.textContent).toContain("Word");
  });

  it("says why a file could not be downloaded, once, and takes ?fileError= off the address", async () => {
    // A refused download comes back here (@medaris/services/file-proxy).
    window.history.replaceState(
      null,
      "",
      "/ders/c-1/odevler?fileError=forbidden"
    );
    await mount();
    const toast = document.querySelector(".mds-toast--error")?.textContent;
    expect(toast).toContain(resources.tr.nazar.Files.downloadErrors.title);
    expect(toast).toContain(resources.tr.nazar.Files.downloadErrors.forbidden);
    expect(`${window.location.pathname}${window.location.search}`).toBe(
      "/ders/c-1/odevler"
    );
  });

  it("writes the times on another course's clock when the course keeps one", async () => {
    state.course = {
      status: "ok",
      data: course({ timeZone: "Europe/Berlin" }),
    };
    await mount();
    expect(rows("l-1")[0]?.querySelector("time")?.textContent).toBe(
      "29 Eyl 2026 20:30"
    );
    expect(document.body.textContent).toContain("(Berlin)");
  });

  it("cuts a long note short, and shows it whole on demand", async () => {
    await mount();
    const row = rows("l-3")[0] as HTMLElement;
    expect(row.textContent).not.toContain("düzeltmelerinizi bekliyorum");
    expect(row.textContent).toContain("…");
    const more = [...row.querySelectorAll("button")].find(
      (b) => b.textContent === "Tamamını göster"
    ) as HTMLButtonElement;
    expect(more.getAttribute("aria-expanded")).toBe("false");
    await click(more);
    expect(row.textContent).toContain("düzeltmelerinizi bekliyorum");
    expect(more.textContent).toBe("Kısalt");
  });

  it("narrows to one celse with the filter, and says so of a celse nobody handed in on", async () => {
    await mount();
    await choose("Celse", "Hafta 2 · Emsile (1)");
    expect(table("l-1")).toBeNull();
    expect(rows("l-3")).toHaveLength(1);
    await choose("Celse", "Hafta 1 · Mastar (0)");
    expect(table("l-2")?.textContent).toContain(
      "Bu celseye henüz ödev teslim edilmedi."
    );
    await choose("Celse", "Bütün celseler");
    expect(table("l-1")).not.toBeNull();
    expect(table("l-3")).not.toBeNull();
  });

  it("offers every celse in programme order, a cancelled one only when it holds homework", async () => {
    await mount();
    await click(document.querySelector('[aria-label="Celse"]') as HTMLElement);
    await settle(40);
    const options = [...document.querySelectorAll("[role=option]")].map((o) =>
      o.textContent?.trim()
    );
    expect(options).toEqual([
      "Bütün celseler",
      "Hafta 1 · Fiil çekimi (2)",
      "Hafta 1 · Mastar (0)",
      "Hafta 2 · Emsile (1)",
    ]);
  });

  it("says so when no celse has homework and nobody has handed in yet, without a filter", async () => {
    state.submissions = {
      status: "ok",
      data: answer([], {
        "l-1": { hasAssignment: false },
        "l-3": { hasAssignment: false },
      }),
    };
    const out = textOf(await markup());
    expect(out).toContain("Henüz ödev yok");
    expect(out).toContain(
      "Bu derste henüz ödev verilmedi, kimse de ödev teslim etmedi."
    );
    expect(out).not.toContain("Bütün celseler");
  });

  it("says under each celse whether it has homework, and how many of the enrolled talebe handed in", async () => {
    await mount();
    const status = (lessonId: string) =>
      document.querySelector(`[data-testid="homework-status-${lessonId}"]`)
        ?.textContent ?? "";
    expect(status("l-1")).toContain("Ödev verildi");
    expect(status("l-1")).toContain("2 / 3 teslim");
    expect(status("l-3")).toContain("1 / 3 teslim");
    await choose("Celse", "Hafta 1 · Mastar (0)");
    expect(status("l-2")).toContain("Ödev verilmedi");
    expect(status("l-2")).toContain("0 / 3 teslim");
  });

  it("draws a celse with homework that nobody handed in yet, at 0 / M, instead of the empty state", async () => {
    state.submissions = {
      status: "ok",
      data: answer([], {
        "l-1": { hasAssignment: false, handedInCount: 0 },
        "l-2": { hasAssignment: true },
        "l-3": { hasAssignment: false, handedInCount: 0 },
      }),
    };
    await mount();
    expect(document.body.textContent).not.toContain("Henüz ödev yok");
    expect(table("l-1")).toBeNull();
    expect(table("l-2")?.textContent).toContain(
      "Bu celseye henüz ödev teslim edilmedi."
    );
    expect(table("l-2")?.textContent).toContain("Ödev verildi");
    expect(table("l-2")?.textContent).toContain("0 / 3 teslim");
  });

  it("is 'Bu sayfaya izniniz yok' for a caller without submission.read, whatever else they hold", async () => {
    state.permissions = holding("course.edit", "session.manage");
    const out = textOf(await markup());
    expect(out).toContain("Bu sayfaya izniniz yok");
    expect(out).not.toContain("Ayşe Nur Demir");
  });

  it("is that state when tedrisat refuses the homework", async () => {
    state.submissions = { status: "forbidden" };
    expect(textOf(await markup())).toContain("Bu sayfaya izniniz yok");
  });

  it("is the retry state, not 'no access', when a read fails", async () => {
    state.submissions = { status: "failed" };
    let out = textOf(await markup());
    expect(out).toContain("Ödevler okunamadı");
    expect(out).not.toContain("Bu sayfaya izniniz yok");
    state.submissions = { status: "ok", data: answer() };
    state.permissions = { status: "failed" };
    out = textOf(await markup());
    expect(out).toContain("Ödevler okunamadı");
  });

  it("is bars while the homework is read", async () => {
    const { HomeworkLoading } = await import(
      "~/features/homework/components/homework-page"
    );
    const out = await html(<HomeworkLoading />);
    expect(out).toContain('aria-busy="true"');
  });
});

describe("the rules of Ödevler", () => {
  it("group homework by celse in programme order, keeping homework on a celse hidden since", () => {
    const sessions = homeworkSessions(
      course() as never,
      [
        ...items(),
        submission({
          id: "s-9",
          lessonId: "l-gone",
          lessonTitle: "Gizlenen celse",
          weekNumber: 1,
        }),
      ] as never,
      counts() as never
    );
    expect(sessions.map((s) => [s.lessonId, s.rows.length])).toEqual([
      ["l-1", 2],
      ["l-2", 0],
      ["l-gone", 1],
      ["l-3", 1],
    ]);
    expect(sessions[2]).toMatchObject({
      title: "Gizlenen celse",
      weekNumber: 1,
      startsAt: null,
      // tedrisat counts live celses only
      hasAssignment: false,
      handIns: null,
    });
    expect(sessions[0]).toMatchObject({
      hasAssignment: true,
      handIns: { count: 2, total: 3 },
    });
    expect(homeworkCounts(sessions)).toEqual({ submissions: 4, sessions: 3 });
  });

  it("list a cancelled celse that has homework, even with nothing handed in", () => {
    const sessions = homeworkSessions(
      course() as never,
      [] as never,
      counts({ "l-4": { hasAssignment: true } }) as never
    );
    expect(sessions.map((s) => s.lessonId)).toEqual([
      "l-1",
      "l-2",
      "l-3",
      "l-4",
    ]);
    expect(
      shownSessions(sessions, ALL_SESSIONS).map((s) => s.lessonId)
    ).toEqual(["l-1", "l-3", "l-4"]);
  });

  it("draw the celses holding homework for 'all', and the chosen one even empty", () => {
    const sessions = homeworkSessions(
      course() as never,
      items() as never,
      counts({
        "l-1": { hasAssignment: false },
        "l-3": { hasAssignment: false },
      }) as never
    );
    expect(
      shownSessions(sessions, ALL_SESSIONS).map((s) => s.lessonId)
    ).toEqual(["l-1", "l-3"]);
    expect(shownSessions(sessions, "l-2").map((s) => s.lessonId)).toEqual([
      "l-2",
    ]);
    // a celse gone since is read as "all"
    expect(shownSessions(sessions, "l-x").map((s) => s.lessonId)).toEqual([
      "l-1",
      "l-3",
    ]);
  });

  it("cut a note at a word, and leave a short one whole", () => {
    expect(noteExcerpt("Kısa not.")).toBeNull();
    const cut = noteExcerpt(LONG_NOTE) as string;
    expect(cut.length).toBeLessThanOrEqual(141);
    expect(cut.endsWith("…")).toBe(true);
    expect(LONG_NOTE.startsWith(cut.slice(0, -1))).toBe(true);
  });

  it("write a change on the clock they are given", () => {
    const at = new Date("2026-09-29T18:30:00Z");
    expect(changedLabel(at, "tr", "Europe/Istanbul")).toBe("29 Eyl 2026 21:30");
    expect(changedLabel(at, "tr", "UTC")).toBe("29 Eyl 2026 18:30");
  });
});

describe("Ödevler: the review", () => {
  const reviewCell = (id: string) =>
    document.querySelector(`[data-testid="review-${id}"]`) as HTMLElement;
  const dialog = () =>
    document.querySelector(
      '[data-testid="review-dialog"]'
    ) as HTMLElement | null;
  const button = (root: ParentNode, label: string) =>
    [...root.querySelectorAll("button")].find(
      (b) => b.textContent?.trim() === label
    ) as HTMLButtonElement | undefined;

  it("says where each homework stands, and how many await a review", async () => {
    state.submissions = {
      status: "ok",
      data: answer([
        // reviewed after the talebe's last change
        submission({ review: sentReview("2026-09-30T08:00:00Z") }),
        // nothing yet
        submission({
          id: "s-2",
          talebe: { id: "u-6", name: null },
          updatedAt: new Date("2026-09-29T07:00:00Z"),
        }),
        // the talebe changed it after the review
        submission({
          id: "s-3",
          lessonId: "l-3",
          lessonTitle: "Emsile",
          weekNumber: 2,
          updatedAt: new Date("2026-10-06T10:00:00Z"),
          review: sentReview("2026-10-05T10:00:00Z"),
        }),
      ]),
    };
    await mount();
    expect(reviewCell("s-1").textContent).toContain("Değerlendirildi");
    // 08:00 UTC is 11:00 in Istanbul
    expect(reviewCell("s-1").textContent).toContain(
      "Yunus Emre Kandemir · 30 Eyl 2026 11:00"
    );
    expect(reviewCell("s-2").textContent).toContain("Değerlendirilmedi");
    expect(reviewCell("s-3").textContent).toContain("Sonradan değişti");
    expect(
      document.querySelector('[data-testid="homework-awaiting-l-1"]')
        ?.textContent
    ).toBe("1 ödev değerlendirme bekliyor");
    expect(
      document.querySelector('[data-testid="homework-awaiting-l-3"]')
        ?.textContent
    ).toBe("1 ödev değerlendirme bekliyor");
  });

  it("sends a note to the talebe, and the row says it is reviewed", async () => {
    actions.sendSubmissionReview.mockResolvedValue({
      success: true,
      data: submission({
        review: sentReview("2026-09-30T08:00:00Z", "Mastarları düzelttim."),
      }),
    });
    await mount();
    await click(button(reviewCell("s-1"), "Değerlendir") as HTMLElement);
    await settle(40);
    const open = dialog() as HTMLElement;
    expect(open.textContent).toContain("odev-1.pdf");
    expect(open.textContent).toContain("Henüz dosya eklenmedi.");
    await typeInto(
      open.querySelector("textarea") as HTMLTextAreaElement,
      "  Mastarları düzelttim.  "
    );
    const form = open.closest("form") as HTMLFormElement;
    await click(button(form, "Değerlendirmeyi gönder") as HTMLElement);
    await settle(40);
    expect(actions.sendSubmissionReview).toHaveBeenCalledWith(
      "c-1",
      "s-1",
      "Mastarları düzelttim."
    );
    expect(dialog()).toBeNull();
    expect(reviewCell("s-1").textContent).toContain("Değerlendirildi");
    expect(document.body.textContent).toContain("Değerlendirme gönderildi");
  });

  it("sends nothing with neither a note nor a file, and says so", async () => {
    await mount();
    await click(button(reviewCell("s-1"), "Değerlendir") as HTMLElement);
    await settle(40);
    const form = (dialog() as HTMLElement).closest("form") as HTMLFormElement;
    await click(button(form, "Değerlendirmeyi gönder") as HTMLElement);
    await settle(40);
    expect(actions.sendSubmissionReview).not.toHaveBeenCalled();
    expect(dialog()?.textContent).toContain(
      "Bir not yazın ya da en az bir dosya ekleyin."
    );
  });

  it("lists the review's files with the course team's download route, and removes one", async () => {
    actions.deleteSubmissionReviewFile.mockResolvedValue({
      success: true,
      data: undefined,
    });
    state.submissions = {
      status: "ok",
      data: answer([
        submission({ review: sentReview("2026-09-30T08:00:00Z") }),
      ]),
    };
    await mount();
    await click(button(reviewCell("s-1"), "Değerlendirmeyi aç") as HTMLElement);
    await settle(40);
    const files = document.querySelector(
      '[data-testid="review-files"]'
    ) as HTMLElement;
    expect(files.querySelector("a")?.getAttribute("href")).toBe(
      "/api/files/courses/c-1/review-files/rf-1"
    );
    await click(
      files.querySelector(
        '[aria-label="duzeltilmis.pdf dosyasını kaldır"]'
      ) as HTMLElement
    );
    await settle(40);
    expect(actions.deleteSubmissionReviewFile).toHaveBeenCalledWith(
      "c-1",
      "s-1",
      "rf-1"
    );
    expect(document.querySelector('[data-testid="review-files"]')).toBeNull();
    expect(
      button(
        (dialog() as HTMLElement).closest("form") as HTMLFormElement,
        "Yeniden gönder"
      )
    ).toBeDefined();
  });

  it("reads a review's status from its times", () => {
    const at = "2026-09-29T18:30:00.000Z";
    expect(reviewStatus({ review: null, updatedAt: at })).toBe("none");
    const review = { note: null, reviewer: null, files: [] };
    expect(
      reviewStatus({ review: { ...review, reviewedAt: null }, updatedAt: at })
    ).toBe("draft");
    expect(
      reviewStatus({
        review: { ...review, reviewedAt: "2026-09-30T00:00:00.000Z" },
        updatedAt: at,
      })
    ).toBe("sent");
    expect(
      reviewStatus({
        review: { ...review, reviewedAt: "2026-09-29T00:00:00.000Z" },
        updatedAt: at,
      })
    ).toBe("changedSince");
  });
});
