import { resources } from "@medaris/i18n";
import type { CourseDetailResponse } from "@medaris/services/tedrisat";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  assignmentMark,
  hasAssignments,
  mayHandInOn,
  pendingAssignments,
} from "~/features/courses/assignment-marks";

/**
 * The homework marks of the course page's programme. The owner, 2026-10-12:
 * "ödevin ödev olduğu anlaşılsın ve yapılmamış ödevin vurgulanması
 * sağlansın". A celse with homework is marked "Ödev"; for a talebe who may
 * hand in and has not, "Ödev teslim edilmedi" (warning), and the Müfredat
 * tab counts those celses beside its summary.
 */

vi.mock("next-intl", async () => {
  const { resources } = await import("@medaris/i18n");
  return {
    useLocale: () => "tr",
    useTranslations: (namespace: string) => {
      const read = (key: string) =>
        [...namespace.split("."), ...key.split(".")].reduce<unknown>(
          (node, part) => (node as Record<string, unknown>)?.[part],
          resources.tr
        ) as string;
      return Object.assign(
        (key: string, values?: Record<string, string | number>) =>
          read(key).replace(/\{(\w+)\}/g, (_, name) =>
            String(values?.[name] ?? "")
          ),
        { raw: read, rich: (key: string) => read(key) }
      );
    },
  };
});
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh() {} }) }));
vi.mock("~/features/courses/actions", () => ({
  enrollInCourse: vi.fn(),
  leaveCourse: vi.fn(),
  withdrawEnrollment: vi.fn(),
  updateCourseProgress: vi.fn(),
}));

// 3 Ekim 2026 Cumartesi 12:00 İstanbul.
const NOW = Date.parse("2026-10-03T09:00:00Z");
const tr = resources.tr.tedris.CoursePage;

const homework = (lessonId: string) => ({
  id: `a-${lessonId}`,
  lessonId,
  description: null,
  files: [],
  createdAt: new Date("2026-09-20T10:00:00Z"),
  updatedAt: new Date("2026-09-20T10:00:00Z"),
});

const lesson = (
  id: string,
  at: string,
  extra: Record<string, unknown> = {}
) => ({
  id,
  weekId: "w",
  title: `Celse ${id}`,
  type: "LIVE",
  scheduledAt: new Date(at),
  durationMinutes: 60,
  isPreview: false,
  orderIndex: 0,
  cancelledAt: null,
  replacementLessonId: null,
  resources: [],
  ...extra,
});

type Status = "ENROLLED" | "COMPLETED" | "PENDING" | null;

/**
 * Week 1: "done" (homework, handed in) and "plain" (none); week 2: "todo"
 * (homework, not handed in), "iptal" (homework, cancelled) and "video"
 * (homework, not a live celse).
 */
const course = (status: Status, contentLocked = false) => {
  const withHomework = (id: string) =>
    contentLocked ? {} : { assignment: homework(id) };
  return {
    id: "c1000000-0000-4000-8000-000000000001",
    koskId: "c1000000-0000-4000-8000-000000000002",
    title: "Bina ve İzhar Şerhi",
    subtitle: null,
    description: null,
    coverHue: 145,
    status: "PUBLISHED",
    requiresApproval: false,
    timeZone: "Europe/Istanbul",
    madrasah: null,
    weeks: [
      {
        id: "w1",
        weekNumber: 1,
        title: "Giriş",
        summary: null,
        lessons: [
          lesson("done", "2026-09-26T18:00:00Z", withHomework("done")),
          lesson(
            "plain",
            "2026-09-27T18:00:00Z",
            contentLocked ? {} : { assignment: null }
          ),
        ],
      },
      {
        id: "w2",
        weekNumber: 2,
        title: "Mastar",
        summary: null,
        lessons: [
          lesson("todo", "2026-10-02T18:00:00Z", withHomework("todo")),
          lesson("iptal", "2026-10-05T18:00:00Z", {
            ...withHomework("iptal"),
            cancelledAt: new Date("2026-10-01T10:00:00Z"),
          }),
          lesson("video", "2026-10-06T18:00:00Z", {
            ...withHomework("video"),
            type: "VIDEO",
          }),
        ],
      },
    ],
    muderris: [],
    resources: [],
    enrollment:
      status === null
        ? null
        : { status, progress: 0, createdAt: new Date("2026-09-01T00:00:00Z") },
    contentLocked,
  } as unknown as CourseDetailResponse;
};

const render = async (
  data: CourseDetailResponse,
  handedIn: string[] | null = ["done"]
) => {
  const { CoursePage } = await import(
    "~/features/courses/components/course-page"
  );
  return renderToStaticMarkup(
    createElement(CoursePage, {
      course: data,
      koskName: "Nûruosmaniye Köşkü",
      signedIn: true,
      now: NOW,
      handedIn,
    })
  );
};

/** The mark of the row whose title is `Celse <id>`, or null. */
const markOf = (html: string, id: string): string | null => {
  const row = html
    .split('<li class="mds-lesson-row')
    .slice(1)
    .find((part) => part.includes(`>Celse ${id}<`));
  const match = row?.match(
    /<span class="mds-badge mds-badge--(\w+)"[^>]*data-testid="assignment-mark"[^>]*>(?:<svg[\s\S]*?<\/svg>)?([^<]*)</
  );
  return match ? `${match[1]}:${match[2]}` : null;
};

describe("the homework marks of the programme", () => {
  it("highlight the celse a talebe has not handed in, and mark the one handed in plainly", async () => {
    const html = await render(course("ENROLLED"));
    expect(markOf(html, "todo")).toBe(`warning:${tr.assignmentPending}`);
    expect(markOf(html, "done")).toBe(`secondary:${tr.assignmentBadge}`);
    expect(markOf(html, "plain")).toBeNull();
    // a cancelled celse keeps its own mark only
    expect(markOf(html, "iptal")).toBeNull();
    // homework on a celse that is not live is marked, never as pending
    expect(markOf(html, "video")).toBe(`secondary:${tr.assignmentBadge}`);
  });

  it("count the celses still to hand in beside the programme's summary", async () => {
    const html = await render(course("COMPLETED"));
    expect(html).toMatch(
      /data-testid="assignments-pending"[^>]*>[\s\S]*?1 ödev teslim edilmedi</
    );
    expect(html).toContain("mds-badge--warning");
  });

  it("show no count once everything is handed in", async () => {
    const html = await render(course("ENROLLED"), ["done", "todo"]);
    expect(html).not.toContain("assignments-pending");
    expect(markOf(html, "todo")).toBe(`secondary:${tr.assignmentBadge}`);
  });

  it("say only 'Ödev' to the course team, who hand nothing in, and when where the talebe handed in could not be read", async () => {
    for (const html of [
      await render(course(null), null),
      await render(course("ENROLLED"), null),
    ]) {
      expect(markOf(html, "todo")).toBe(`secondary:${tr.assignmentBadge}`);
      expect(html).not.toContain("assignments-pending");
    }
  });

  it("tell a caller who may not read the content nothing", async () => {
    const html = await render(course("PENDING", true), null);
    expect(html).not.toContain("assignment-mark");
    expect(html).not.toContain("assignments-pending");
  });
});

describe("the rules of the homework marks", () => {
  const viewer = (handedIn: string[] | null, mayHandIn = true) => ({
    mayHandIn,
    handedIn: handedIn ? new Set(handedIn) : null,
  });
  const live = (over: Record<string, unknown> = {}) =>
    ({
      id: "l1",
      type: "LIVE",
      cancelledAt: null,
      assignment: homework("l1"),
      ...over,
    }) as never;

  it("mark a live, standing celse with homework pending until it is handed in", () => {
    expect(assignmentMark(live(), viewer([]))).toBe("pending");
    expect(assignmentMark(live(), viewer(["l1"]))).toBe("set");
    expect(assignmentMark(live(), viewer(null))).toBe("set");
    expect(assignmentMark(live(), viewer([], false))).toBe("set");
  });

  it("leave a celse without homework, and a cancelled one, unmarked", () => {
    expect(assignmentMark(live({ assignment: undefined }), viewer([]))).toBe(
      null
    );
    expect(
      assignmentMark(live({ cancelledAt: new Date() }), viewer([]))
    ).toBeNull();
  });

  it("count the pending celses and know who may hand in", () => {
    const data = course("ENROLLED");
    expect(pendingAssignments(data, viewer(["done"]))).toBe(1);
    expect(pendingAssignments(data, viewer([]))).toBe(2);
    expect(hasAssignments(data)).toBe(true);
    expect(hasAssignments(course("PENDING", true))).toBe(false);
    expect(mayHandInOn(data)).toBe(true);
    expect(mayHandInOn(course("COMPLETED"))).toBe(true);
    expect(mayHandInOn(course(null))).toBe(false);
    expect(mayHandInOn(course("ENROLLED", true))).toBe(false);
  });
});
