import { afterEach, describe, expect, it, vi } from "vitest";
import {
  nextSessionAt,
  overviewBoxes,
} from "~/features/course-overview/course-overview";
import { html, textOf, translatorFor } from "./server-render";

/**
 * Genel bakış of a course: the boxes as rules, and the page as the server
 * renders it from each answer. The reads are stubs.
 */
type Answer<T> =
  | { status: "ok"; data: T }
  | { status: "forbidden" }
  | { status: "failed" };

const NOW = new Date("2026-10-27T09:00:00Z");

const lesson = (id: string, scheduledAt: string, over = {}) => ({
  id,
  title: `Celse ${id}`,
  type: "LIVE",
  scheduledAt,
  durationMinutes: 60,
  ...over,
});

const courseOf = (over: Record<string, unknown> = {}) => ({
  id: "c-1",
  title: "Bina ve İzhar Şerhi",
  status: "PUBLISHED",
  timeZone: "Europe/Istanbul",
  weeks: [
    {
      id: "w1",
      weekNumber: 1,
      lessons: [
        lesson("l-past", "2026-10-20T16:00:00Z"),
        lesson("l-cancelled", "2026-10-28T16:00:00Z", {
          cancelledAt: "2026-10-26T10:00:00Z",
        }),
        lesson("l-next", "2026-10-29T16:00:00Z"),
        { id: "l-rec", title: "Kayıt", type: "RECORDED", scheduledAt: null },
      ],
    },
  ],
  ...over,
});

const submission = (id: string, review: unknown) => ({
  id,
  lessonId: "l-past",
  note: null,
  createdAt: "2026-10-21T10:00:00Z",
  updatedAt: "2026-10-21T10:00:00Z",
  files: [],
  review,
  lessonTitle: "Celse l-past",
  weekNumber: 1,
  talebe: { id: `u-${id}`, name: `Talebe ${id}` },
});

const state = {
  course: { status: "failed" } as Answer<unknown>,
  counts: { status: "failed" } as Answer<unknown>,
  permissions: { status: "failed" } as Answer<unknown>,
  homework: { status: "failed" } as Answer<unknown>,
  tedris: "http://localhost:4000" as string | undefined,
  reads: [] as string[],
};

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));
vi.mock("next-intl/server", () => ({
  getTranslations: async (namespace?: string) => translatorFor(namespace),
  getLocale: async () => "tr",
}));
vi.mock("~/env", () => ({
  env: {
    get TEDRIS_URL() {
      return state.tedris;
    },
  },
}));
vi.mock("~/lib/tedrisat-read", () => ({
  readOnce: async (what: string, call: (api: unknown) => Promise<unknown>) => {
    state.reads.push(what);
    await call({
      courses: {
        getCourseById: async () => {},
        getCourseBadgeCounts: async () => {},
        getMyCoursePermissions: async () => {},
      },
      submissions: { listCourseSubmissions: async () => {} },
    });
    if (what.includes("badge counts")) return state.counts;
    if (what.includes("holds in the course")) return state.permissions;
    if (what.includes("homework")) return state.homework;
    return state.course;
  },
}));

const holding = (...codes: string[]): Answer<unknown> => ({
  status: "ok",
  data: { permissions: ["course.view", ...codes], staffRead: false },
});

const page = async () => {
  const { CourseOverviewPage } = await import(
    "~/features/course-overview/components/course-overview-page"
  );
  return html(await CourseOverviewPage({ courseId: "c-1" }));
};

afterEach(() => {
  vi.useRealTimers();
  state.course = { status: "failed" };
  state.counts = { status: "failed" };
  state.permissions = { status: "failed" };
  state.homework = { status: "failed" };
  state.tedris = "http://localhost:4000";
  state.reads = [];
});

describe("the next session", () => {
  it("is the first live session still ahead, skipping a cancelled one", () => {
    expect(nextSessionAt(courseOf() as never, NOW)?.toISOString()).toBe(
      "2026-10-29T16:00:00.000Z"
    );
  });

  it("is null when nothing is ahead", () => {
    expect(
      nextSessionAt(courseOf() as never, new Date("2026-11-01T00:00:00Z"))
    ).toBeNull();
  });
});

describe("the boxes", () => {
  const where = { locale: "tr", timeZone: "Europe/Istanbul" };

  it("lists each waiting thing with its section, in a fixed order", () => {
    const boxes = overviewBoxes(
      "c 1",
      {
        applications: 3,
        homework: 2,
        withoutAccess: 1,
        nextSession: new Date("2026-10-29T16:00:00Z"),
      },
      where
    );
    expect(boxes.map((box) => [box.id, box.href])).toEqual([
      ["applications", "/ders/c%201/talebeler"],
      ["homework", "/ders/c%201/odevler"],
      ["withoutAccess", "/ders/c%201/celseler"],
      ["nextSession", "/ders/c%201/celseler"],
    ]);
    // 19:00 in Istanbul, the course's clock
    expect(boxes[3]?.value).toMatch(/29 Eki.*19:00/);
  });

  it("draws no box for a zero, a number not read, or no session ahead", () => {
    expect(
      overviewBoxes(
        "c-1",
        {
          applications: 0,
          homework: null,
          withoutAccess: 0,
          nextSession: null,
        },
        where
      )
    ).toEqual([]);
  });
});

describe("Genel bakış", () => {
  it("shows the course's name, its state, Tedris’te aç and the boxes", async () => {
    vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
    state.course = { status: "ok", data: courseOf() };
    state.counts = {
      status: "ok",
      data: { pendingApplications: 4, sessionsWithoutAccess: 2 },
    };
    state.permissions = holding("submission.read");
    state.homework = {
      status: "ok",
      data: {
        items: [
          submission("s-1", null),
          submission("s-2", {
            note: "Güzel",
            reviewedAt: "2026-10-22T10:00:00Z",
            reviewer: null,
            files: [],
          }),
        ],
        sessions: [],
        talebeCount: 2,
      },
    };

    const markup = await page();
    const text = textOf(markup);
    expect(text).toMatch(/^Bina ve İzhar Şerhi Yayında Tedris’te aç/);
    expect(markup).toContain('href="http://localhost:4000/tr/courses/c-1"');
    expect(text).toContain("Bekleyen başvuru 4");
    expect(text).toContain("Değerlendirme bekleyen ödev 1");
    expect(text).toContain("Katılım yolu eksik celse 2");
    expect(text).toMatch(/Sıradaki celse 29 Eki.*19:00/);
    expect(markup).toContain('href="/ders/c-1/talebeler"');
    expect(markup).toContain('href="/ders/c-1/odevler"');
    expect(text).not.toContain("Bekleyen işiniz yok.");
  });

  it("does not read the homework for a caller without submission.read, and says Taslak", async () => {
    vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
    state.course = { status: "ok", data: courseOf({ status: "DRAFT" }) };
    state.counts = {
      status: "ok",
      data: { pendingApplications: 1, sessionsWithoutAccess: 0 },
    };
    state.permissions = holding("session.manage");

    const text = textOf(await page());
    expect(state.reads).not.toContain("the course's homework");
    expect(text).toContain("Taslak");
    expect(text).not.toContain("Değerlendirme bekleyen ödev");
    expect(text).not.toContain("Katılım yolu eksik celse");
  });

  it("says there is nothing waiting when every box is empty", async () => {
    vi.useFakeTimers({
      now: new Date("2026-11-01T00:00:00Z"),
      toFake: ["Date"],
    });
    state.course = { status: "ok", data: courseOf() };
    state.counts = { status: "forbidden" };
    state.permissions = holding();
    state.tedris = undefined;

    const text = textOf(await page());
    expect(text).toBe("Bina ve İzhar Şerhi Yayında Bekleyen işiniz yok.");
  });

  it("names the failed read when the course cannot be read", async () => {
    const text = textOf(await page());
    expect(text).toContain("Genel bakış");
    expect(text).toContain("Ders yüklenemedi");
  });
});
