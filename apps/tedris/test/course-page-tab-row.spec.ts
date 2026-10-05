// @vitest-environment happy-dom
import type { CourseDetailResponse } from "@medaris/services/tedrisat";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, click, render } from "./dom";

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
vi.mock("~/features/courses/actions/questions", () => ({
  listMyCourseQuestions: vi.fn(async () => ({ success: true, data: [] })),
  askLessonQuestion: vi.fn(),
  updateLessonQuestion: vi.fn(),
  deleteLessonQuestion: vi.fn(),
}));
vi.mock("~/features/courses/actions/notes", () => ({
  listLessonNotes: vi.fn(async () => ({ success: true, data: [] })),
  createLessonNote: vi.fn(),
  updateLessonNote: vi.fn(),
  deleteLessonNote: vi.fn(),
}));

/**
 * The recordings tab gives its video the page's width (MDRS-280): its tab row
 * starts under the taller of the header and the aside card, the other tabs'
 * under the header. A switch between them would move the row under the
 * reader's pointer; the page scrolls by what it moved instead. happy-dom lays
 * nothing out, so the row's place is given here: 400 px from the top of the
 * window on the curriculum, 592 px on the recordings tab.
 */

const course = {
  id: "c1000000-0000-4000-8000-000000000001",
  koskId: "c1000000-0000-4000-8000-000000000002",
  title: "Bina ve İzhar Şerhi",
  subtitle: null,
  description: null,
  category: null,
  level: "BEGINNER",
  language: null,
  coverHue: 145,
  status: "PUBLISHED",
  requiresApproval: false,
  grantsCertificate: false,
  timeZone: "Europe/Istanbul",
  madrasah: null,
  weeks: [],
  muderris: [],
  resources: [],
  enrollment: {
    status: "ENROLLED",
    progress: 0,
    createdAt: new Date("2026-10-03T07:02:00Z"),
  },
  contentLocked: false,
} as unknown as CourseDetailResponse;

afterEach(async () => {
  await cleanup();
  vi.restoreAllMocks();
});

const rowTop = () =>
  document
    .querySelector('[role="tab"][aria-selected="true"]')
    ?.textContent?.includes("Ders kayıtları")
    ? 592
    : 400;

describe("the course page's tab row", () => {
  it("stays where the reader clicked it when the recordings tab widens the page", async () => {
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(
      function (this: Element) {
        const top = this.querySelector('[role="tablist"]') ? rowTop() : 0;
        return {
          top,
          bottom: top,
          left: 0,
          right: 0,
          width: 0,
          height: 0,
          x: 0,
          y: top,
          toJSON() {},
        } as DOMRect;
      }
    );
    const scrollBy = vi.spyOn(window, "scrollBy").mockImplementation(() => {});
    const { CoursePage } = await import(
      "~/features/courses/components/course-page"
    );
    const host = await render(
      createElement(CoursePage, {
        course,
        koskName: null,
        signedIn: true,
        now: Date.parse("2026-10-03T09:00:00Z"),
        recordings: [],
      })
    );
    const tab = (name: string) =>
      [...host.querySelectorAll('[role="tab"]')].find((t) =>
        t.textContent?.includes(name)
      ) as HTMLElement;

    await click(tab("Ders kayıtları"));
    expect(scrollBy).toHaveBeenLastCalledWith(0, 192);
    await click(tab("Müfredat"));
    expect(scrollBy).toHaveBeenLastCalledWith(0, -192);
    expect(scrollBy).toHaveBeenCalledTimes(2);
  });
});
