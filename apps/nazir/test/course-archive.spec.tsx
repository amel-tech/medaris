// @vitest-environment happy-dom
import { resources } from "@medaris/i18n";
import { Toaster, ToastProvider } from "@medaris/ui/mds/toast";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  COURSE_ARCHIVE_TABS,
  courseArchiveHref,
  courseTabOf,
} from "~/features/course-archive/course-archive";
import { cleanup, click, render, settle } from "./dom";
import { html, textOf, translatorFor } from "./server-render";

/**
 * Arşiv of a course (MDRS-143) as the server renders it: the weeks and sessions
 * hidden in it, by tab, with "Geri al" for whoever hid a row or a level above.
 * The read is stubbed; what is under test is what the page does with each answer.
 */
type Answer<T> =
  | { status: "ok"; data: T }
  | { status: "forbidden" }
  | { status: "failed" };

const state = {
  archive: { status: "failed" } as Answer<unknown>,
  asked: [] as unknown[],
};
const refresh = vi.fn();
const restoreItem = vi.fn();

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
  readOnce: async (_what: string, call: (api: unknown) => Promise<unknown>) => {
    await call({
      archive: {
        listCourseArchive: async (request: unknown) => {
          state.asked.push(request);
        },
      },
    });
    return state.archive;
  },
}));
vi.mock("~/features/account/reads", () => ({
  getViewer: async () => ({ id: "u-1", timeZone: "Europe/Istanbul" }),
}));
vi.mock("~/features/archive/actions", () => ({
  restoreItem: (type: string, id: string) => restoreItem(type, id),
  hideMedrese: vi.fn(),
  restoreMedrese: vi.fn(),
}));

const self = { id: "u-1", name: "Mehmet Emin Işıkoğlu" };
const row = (over: Record<string, unknown>) => ({
  type: "week",
  id: "w-1",
  title: "Hafta 9: Genel tekrar",
  koskId: "k-1",
  koskName: "Nûruosmaniye Köşkü",
  madrasahId: null,
  madrasahName: null,
  courseId: "c-1",
  courseTitle: "İsâgûcî ile mantığa giriş",
  weekNumber: 9,
  scheduledAt: null,
  weekCount: null,
  sessionCount: 3,
  studentCount: null,
  archivedAt: new Date("2026-09-26T09:00:00Z"),
  archivedBy: { ...self, role: "MUDERRIS" },
  hiddenLevel: "course",
  canRestore: true,
  ...over,
});
const items = [
  row({
    type: "session",
    id: "s-1",
    title: "Mantığın tarifi ve konusu",
    weekNumber: 1,
    archivedAt: new Date("2026-10-01T07:05:00Z"),
    archivedBy: {
      id: "u-2",
      name: "Ömer Nasuhi Bilmenoğlu",
      role: "KOSK_NAZIM",
    },
    hiddenLevel: "kosk",
    canRestore: false,
  }),
  row({}),
];
const listing = (over: Record<string, unknown> = {}) => ({
  items,
  total: 2,
  page: 1,
  limit: 10,
  counts: { all: 2, week: 1, session: 1 },
  ...over,
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

const importPage = () =>
  import("~/features/course-archive/components/course-archive-page");
const markup = async (tabParam?: string, number = 1) => {
  const { CourseArchivePage } = await importPage();
  return html(
    wrap(<CourseArchivePage courseId="c-1" tabParam={tabParam} page={number} />)
  );
};
const mount = async () => {
  const { CourseArchivePage } = await importPage();
  const { expand } = await import("./server-render");
  await render(
    wrap(
      await expand(
        <CourseArchivePage courseId="c-1" tabParam={undefined} page={1} />
      )
    )
  );
  await settle(40);
};
const toast = (tone: string) =>
  document.querySelector(`.mds-toast--${tone}`)?.textContent ?? "";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-02T12:00:00+03:00"));
  state.archive = { status: "ok", data: listing() };
  state.asked = [];
  refresh.mockReset();
  restoreItem.mockReset();
});
afterEach(async () => {
  await cleanup();
  vi.useRealTimers();
});

describe("the course's tabs", () => {
  it("ask the API for the types they name, and count from its numbers", () => {
    expect(COURSE_ARCHIVE_TABS.map((tab) => [tab.id, tab.types])).toEqual([
      ["all", undefined],
      ["weeks", "week"],
      ["sessions", "session"],
    ]);
    const counts = { all: 5, week: 2, session: 3 };
    expect(COURSE_ARCHIVE_TABS.map((tab) => tab.count(counts))).toEqual([
      5, 2, 3,
    ]);
  });

  it("are chosen by ?tur=, and a value nobody knows is 'Tümü'", () => {
    expect(courseTabOf("hafta").id).toBe("weeks");
    expect(courseTabOf("celse").id).toBe("sessions");
    expect(courseTabOf("kayit").id).toBe("all");
    expect(courseTabOf(undefined).id).toBe("all");
  });

  it("are addressed under the course, with the page only after the first", () => {
    const [all, weeks] = COURSE_ARCHIVE_TABS as [
      (typeof COURSE_ARCHIVE_TABS)[number],
      (typeof COURSE_ARCHIVE_TABS)[number],
    ];
    expect(courseArchiveHref("c-1", all, 1)).toBe("/ders/c-1/arsiv");
    expect(courseArchiveHref("c-1", weeks, 1)).toBe(
      "/ders/c-1/arsiv?tur=hafta"
    );
    expect(courseArchiveHref("c-1", weeks, 3)).toBe(
      "/ders/c-1/arsiv?tur=hafta&sayfa=3"
    );
  });
});

describe("Arşiv of a course", () => {
  it("is headed with its sentence and asks for the first ten of everything", async () => {
    const out = await markup();
    expect(out).toMatch(/<h1[^>]*>Arşiv<\/h1>/);
    expect(textOf(out)).toContain(
      "Bu derste gizlenen haftalar ve celseler. Hiçbiri silinmez; öğeyi gizleyen kademe ya da üstü geri alır."
    );
    expect(state.asked).toEqual([
      { id: "c-1", types: undefined, page: 1, limit: 10 },
    ]);
  });

  it("has the three tabs with the API's numbers, as links under the course", async () => {
    const out = await markup();
    const tabs = out.match(/<nav[^>]*mds-tabs[\s\S]*?<\/nav>/)?.[0] ?? "";
    expect(textOf(tabs)).toBe("Tümü 2 Haftalar 1 Celseler 1");
    expect(tabs).toContain('href="/ders/c-1/arsiv"');
    expect(tabs).toContain('href="/ders/c-1/arsiv?tur=hafta"');
    expect(tabs).toContain('href="/ders/c-1/arsiv?tur=celse"');
  });

  it("asks the API only for the types of the tab, and for the page", async () => {
    await markup("celse", 2);
    expect(state.asked).toEqual([
      { id: "c-1", types: "session", page: 2, limit: 10 },
    ]);
  });

  it("lists what is hidden, who hid it, and 'Geri al' only where the caller's kademe allows it", async () => {
    const out = await markup();
    const table = out.slice(out.indexOf('data-testid="archive"'));
    const rows = table.split("<tr").slice(2).map(textOf);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toContain("Mantığın tarifi ve konusu");
    expect(rows[0]).toContain("Ömer Nasuhi Bilmenoğlu Köşk nazımı");
    expect(rows[0]).not.toContain("Geri al");
    expect(rows[0]).toContain(
      "Bunu köşk nazımı gizledi; yalnız o kademe ya da üstü geri alabilir."
    );
    expect(rows[1]).toContain("Hafta 9: Genel tekrar");
    expect(rows[1]).toContain("Mehmet Emin Işıkoğlu Müderris (siz)");
    expect(rows[1]).toContain("Geri al");
  });

  it("says in one sentence what is missing on a tab with nothing hidden", async () => {
    state.archive = {
      status: "ok",
      data: listing({
        items: [],
        total: 0,
        counts: { all: 0, week: 0, session: 0 },
      }),
    };
    expect(textOf(await markup())).toContain(
      "Bu derste gizlenmiş bir hafta ya da celse yok."
    );
    expect(textOf(await markup("hafta"))).toContain(
      "Bu derste gizlenmiş bir hafta yok."
    );
    expect(textOf(await markup("celse"))).toContain(
      "Bu derste gizlenmiş bir celse yok."
    );
  });

  it("pages ten at a time, with links to the page before and after", async () => {
    state.archive = {
      status: "ok",
      data: listing({
        total: 24,
        page: 2,
        counts: { all: 24, week: 24, session: 0 },
      }),
    };
    const out = await markup("hafta", 2);
    expect(textOf(out)).toContain("11–20 / 24");
    expect(out).toContain('href="/ders/c-1/arsiv?tur=hafta"');
    expect(out).toContain('href="/ders/c-1/arsiv?tur=hafta&amp;sayfa=3"');
  });

  it("answers a refusal with a notice, without the list", async () => {
    state.archive = { status: "forbidden" };
    const out = await markup();
    expect(textOf(out)).toContain("Bu sayfaya izniniz yok");
    expect(out).not.toContain('data-testid="archive"');
  });

  it("answers a failed read with the retry state, never with 'izniniz yok'", async () => {
    state.archive = { status: "failed" };
    const text = textOf(await markup());
    expect(text).toContain("Arşiv okunamadı");
    expect(text).toContain("Yeniden dene");
    expect(text).not.toContain("izniniz yok");
  });

  it("draws bars while the archive is read", async () => {
    const { CourseArchiveLoading } = await importPage();
    const out = await html(<CourseArchiveLoading />);
    expect(out).toContain('aria-busy="true"');
    expect(out.match(/mds-skeleton/g)?.length).toBeGreaterThan(2);
  });
});

describe("'Geri al' on a course's row", () => {
  it("brings the week back by its type and id, says so, and reads the page again", async () => {
    restoreItem.mockResolvedValue({
      success: true,
      data: { title: "Hafta 9: Genel tekrar" },
    });
    await mount();
    await click(
      document.querySelector(
        'button[aria-label="Geri al: Hafta 9: Genel tekrar"]'
      ) as HTMLButtonElement
    );
    await settle(60);
    expect(restoreItem).toHaveBeenCalledExactlyOnceWith("week", "w-1");
    expect(toast("success")).toContain("Geri alındı");
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("has no button on the session a higher level hid", async () => {
    await mount();
    expect(
      document.querySelector('button[aria-label^="Geri al: Mantığın tarifi"]')
    ).toBeNull();
    expect(
      document.querySelectorAll("[data-testid=restore-note]")
    ).toHaveLength(1);
  });
});
