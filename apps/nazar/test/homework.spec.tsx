// @vitest-environment happy-dom
import { resources } from "@medaris/i18n";
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
  shownSessions,
} from "~/features/homework/homework";
import { cleanup, click, render, settle } from "./dom";
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

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), replace: vi.fn(), push: vi.fn() }),
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
  ...over,
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
      <HomeworkPage courseId="c-1" />
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
  state.course = { status: "ok", data: course() };
  state.permissions = holding("submission.read");
  state.submissions = { status: "ok", data: { items: items() } };
  asked.length = 0;
});
afterEach(async () => {
  await cleanup();
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
    const link = first?.querySelector("a[download]") as HTMLAnchorElement;
    expect(link.getAttribute("href")).toBe(
      "/api/files/courses/c-1/submissions/f-1"
    );
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

  it("says so when nobody has handed in yet, without a filter", async () => {
    state.submissions = { status: "ok", data: { items: [] } };
    const out = textOf(await markup());
    expect(out).toContain("Henüz ödev yok");
    expect(out).toContain("Bu derste henüz kimse ödev teslim etmedi.");
    expect(out).not.toContain("Bütün celseler");
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
    state.submissions = { status: "ok", data: { items: items() } };
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
      ] as never
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
    });
    expect(homeworkCounts(sessions)).toEqual({ submissions: 4, sessions: 3 });
  });

  it("draw the celses holding homework for 'all', and the chosen one even empty", () => {
    const sessions = homeworkSessions(course() as never, items() as never);
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
