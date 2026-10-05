import { resources } from "@medaris/i18n";
import type { CourseDetailResponse } from "@medaris/services/tedrisat";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

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
  listMyCourseQuestions: vi.fn(),
  askLessonQuestion: vi.fn(),
  updateLessonQuestion: vi.fn(),
  deleteLessonQuestion: vi.fn(),
}));

/**
 * Which tabs of the course page carry questions (MDRS-150): "Sorularım" for
 * an enrolled talebe and none for anyone else. The staff answer in the nazar
 * app, so the course page has no tab for them.
 */

const NOW = Date.parse("2026-10-03T09:00:00Z");
const tr = resources.tr.tedris.CoursePage;

type Status = "PENDING" | "ENROLLED" | "COMPLETED" | "REVOKED" | null;

const course = (status: Status, contentLocked: boolean) =>
  ({
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
    enrollment:
      status === null
        ? null
        : {
            status,
            progress: 0,
            createdAt: new Date("2026-10-03T07:02:00Z"),
          },
    contentLocked,
  }) as unknown as CourseDetailResponse;

const render = async (
  status: Status,
  props: { contentLocked?: boolean } = {}
) => {
  const { CoursePage } = await import(
    "~/features/courses/components/course-page"
  );
  const seat = status === "ENROLLED" || status === "COMPLETED";
  return renderToStaticMarkup(
    createElement(CoursePage, {
      course: course(status, props.contentLocked ?? !seat),
      koskName: "Nûruosmaniye Köşkü",
      now: NOW,
    })
  );
};

const tabs = (html: string) =>
  [...html.matchAll(/role="tab"[^>]*>(.*?)<\/button>/g)].map((m) =>
    m[1].replace(/<[^>]+>/g, "")
  );

describe("the question tabs of the course page", () => {
  it.each([
    "ENROLLED",
    "COMPLETED",
  ] as const)("gives a talebe with status %s the Sorularım tab", async (status) => {
    const html = tabs(await render(status));
    expect(html).toContain(tr.tabMyQuestions);
  });

  it.each([
    null,
    "PENDING",
    "REVOKED",
  ] as const)("gives no question tab to someone whose status is %s", async (status) => {
    const html = tabs(await render(status));
    expect(html).not.toContain(tr.tabMyQuestions);
  });

  it("gives no question tab to a talebe whose content is locked", async () => {
    const html = tabs(await render("ENROLLED", { contentLocked: true }));
    expect(html).not.toContain(tr.tabMyQuestions);
  });
});
