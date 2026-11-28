import { resources } from "@medaris/i18n";
import type { CourseDetailResponse } from "@medaris/services/tedrisat";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { courseDocuments } from "~/features/courses/documents-model";

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
}));

const t = resources.tr.tedrisLearn.DocumentsTab;
const tabLabel = resources.tr.tedris.CoursePage.tabDocuments;

const COURSE = "c1000000-0000-4000-8000-000000000001";
const L1 = "11000000-0000-4000-8000-000000000001";
const L2 = "11000000-0000-4000-8000-000000000002";
const L3 = "11000000-0000-4000-8000-000000000003";
const R = (n: number) => `22000000-0000-4000-8000-00000000000${n}`;

const file = (name: string, scope: string, id: string) => ({
  fileName: name,
  contentType: "application/pdf",
  sizeBytes: 2048,
  downloadUrl: `/${scope}/resources/${id}/file`,
});

const courseFile = (n: number, name: string) => ({
  id: R(n),
  name,
  file: file(name, `courses/${COURSE}`, R(n)),
});
const lessonFile = (n: number, lessonId: string, name: string) => ({
  id: R(n),
  name,
  meta: null,
  file: file(name, `lessons/${lessonId}`, R(n)),
});

const lesson = (id: string, title: string, res: unknown[] = []) => ({
  id,
  weekId: "w",
  title,
  type: "LIVE",
  scheduledAt: new Date("2026-10-04T18:00:00Z"),
  durationMinutes: 60,
  isPreview: false,
  orderIndex: 0,
  cancelledAt: null,
  replacementLessonId: null,
  resources: res,
});

const course = (
  contentLocked: boolean,
  over: Partial<Record<"resources" | "weeks", unknown>> = {}
) =>
  ({
    id: COURSE,
    koskId: "c1000000-0000-4000-8000-000000000002",
    title: "Tefsir dersi",
    subtitle: null,
    description: null,
    level: "BEGINNER",
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
        lessons: [
          lesson(L1, "1. celse: Besmele", [
            lessonFile(2, L1, "Besmele notları.pdf"),
          ]),
        ],
      },
      {
        id: "w2",
        weekNumber: 2,
        title: "Hafta 2",
        lessons: [
          lesson(L3, "Boş celse"),
          lesson(L2, "2. celse: Fâtiha sûresi", [
            lessonFile(3, L2, "Fâtiha sûresi meâli.pdf"),
          ]),
        ],
      },
      { id: "w3", weekNumber: 3, title: "Bakara", lessons: [lesson(L3, "x")] },
    ],
    muderris: [],
    resources: [courseFile(1, "Ders programı.pdf")],
    enrollment: contentLocked
      ? null
      : { status: "ENROLLED", progress: 0, createdAt: new Date() },
    contentLocked,
    ...over,
  }) as unknown as CourseDetailResponse;

describe("courseDocuments (MDRS-248)", () => {
  it("puts the course's documents first, then each celse's in programme order", () => {
    const docs = courseDocuments(course(false));
    expect(docs.general.map((r) => r.name)).toEqual(["Ders programı.pdf"]);
    expect(docs.weeks.map((w) => w.weekNumber)).toEqual([1, 2]);
    expect(docs.weeks.flatMap((w) => w.sessions.map((s) => s.title))).toEqual([
      "1. celse: Besmele",
      "2. celse: Fâtiha sûresi",
    ]);
    expect(docs.count).toBe(3);
  });

  it("leaves out weeks and celses without a document", () => {
    const docs = courseDocuments(course(false));
    expect(docs.weeks.some((w) => w.weekId === "w3")).toBe(false);
    expect(
      docs.weeks.flatMap((w) => w.sessions).some((s) => s.lessonId === L3)
    ).toBe(false);
  });

  it("counts nothing for a course without documents", () => {
    const docs = courseDocuments(
      course(false, {
        resources: [],
        weeks: [
          { id: "w", weekNumber: 1, title: "", lessons: [lesson(L1, "a")] },
        ],
      })
    );
    expect(docs).toEqual({ general: [], weeks: [], count: 0 });
  });
});

describe("DocumentsTab (MDRS-248)", () => {
  const draw = async (c: CourseDetailResponse) => {
    const { DocumentsTab } = await import(
      "~/features/courses/components/documents-tab"
    );
    return renderToStaticMarkup(
      createElement(DocumentsTab, {
        documents: courseDocuments(c),
        courseId: c.id,
      })
    );
  };

  it("lists the whole course first, then the celses under their weeks", async () => {
    const html = await draw(course(false));
    const at = (s: string) => html.indexOf(s);
    expect(at(t.general)).toBeGreaterThan(-1);
    expect(at(t.general)).toBeLessThan(at("Hafta 1"));
    expect(at("Ders programı.pdf")).toBeLessThan(at("Besmele notları.pdf"));
    expect(at("Besmele notları.pdf")).toBeLessThan(
      at("Fâtiha sûresi meâli.pdf")
    );
  });

  it("downloads each file through this app and links each celse to its page", async () => {
    const html = await draw(course(false));
    expect(html).toContain(
      `href="/api/files/courses/${COURSE}/resources/${R(1)}"`
    );
    expect(html).toContain(`href="/api/files/lessons/${L2}/resources/${R(3)}"`);
    expect(html).toContain(`href="/courses/${COURSE}/lessons/${L1}"`);
    expect(html).toContain(`href="/courses/${COURSE}/lessons/${L2}"`);
  });

  it("says so when the course has no documents", async () => {
    const html = await draw(course(false, { resources: [], weeks: [] }));
    expect(html).toContain(t.empty);
    expect(html).not.toContain('data-testid="documents-tab"');
  });
});

describe("the course page's Dokümanlar tab (MDRS-248)", () => {
  const page = async (c: CourseDetailResponse) => {
    const { CoursePage } = await import(
      "~/features/courses/components/course-page"
    );
    return renderToStaticMarkup(
      createElement(CoursePage, {
        course: c,
        initialTab: "dokumanlar",
        now: Date.parse("2026-10-03T09:00:00Z"),
      })
    );
  };

  it("comes right after Ders kayıtları, with how many documents there are", async () => {
    const html = await page(course(false));
    const recordings = html.indexOf(
      resources.tr.tedris.CoursePage.tabRecordings
    );
    expect(recordings).toBeGreaterThan(-1);
    expect(html.indexOf(tabLabel)).toBeGreaterThan(recordings);
    expect(html).toMatch(new RegExp(`${tabLabel}[^]*?>3<`));
    expect(html).toContain('data-testid="documents-tab"');
  });

  it("is not there for a viewer who may not read the content", async () => {
    const html = await page(course(true));
    expect(html).not.toContain(tabLabel);
    expect(html).not.toContain('data-testid="documents-tab"');
  });
});
