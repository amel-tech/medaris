import { resources } from "@medaris/i18n";
import type { CourseDetailResponse } from "@medaris/services/tedrisat";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next-intl", async () => {
  const { resources } = await import("@medaris/i18n");
  return {
    useLocale: () => "tr",
    // The lesson rows write their times through SessionTime; the date is not under test.
    useFormatter: () => ({ dateTime: () => "12 Eki 21:00" }),
    useTimeZone: () => "Europe/Istanbul",
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
}));

const lesson = (id: string, scheduledAt: string | null) => ({
  id,
  title: id,
  type: "LIVE",
  scheduledAt: scheduledAt === null ? null : new Date(scheduledAt),
  isPreview: false,
  orderIndex: 0,
});

const course = (status: "DRAFT" | "PUBLISHED") =>
  ({
    id: "c1000000-0000-4000-8000-000000000001",
    koskId: "c1000000-0000-4000-8000-000000000002",
    title: "Kâfiye’ye giriş",
    subtitle: null,
    description: null,
    category: null,
    level: "BEGINNER",
    language: null,
    coverHue: 145,
    status,
    requiresApproval: false,
    grantsCertificate: false,
    timeZone: "Europe/Istanbul",
    weeks: [
      {
        id: "w1",
        weekNumber: 1,
        title: "Hafta 1",
        lessons: [lesson("l2", "2026-10-19T18:00:00Z")],
      },
      {
        id: "w2",
        weekNumber: 2,
        title: "Hafta 2",
        lessons: [lesson("l1", "2026-10-12T18:00:00Z")],
      },
    ],
    muderris: [],
    resources: [],
    enrollment: null,
    contentLocked: true,
  }) as unknown as CourseDetailResponse;

const render = async (status: "DRAFT" | "PUBLISHED", nazarUrl?: string) => {
  const { CoursePage } = await import(
    "~/features/courses/components/course-page"
  );
  return renderToStaticMarkup(
    createElement(CoursePage, {
      course: course(status),
      signedIn: true,
      nazarUrl: nazarUrl ?? null,
    })
  );
};

describe("tedris/14: a draft is shown as a preview", () => {
  const tr = resources.tr.tedris.CoursePage;

  it("has the banner, the badge, the preview card and the earliest session", async () => {
    const html = await render("DRAFT", "http://nazar.test");
    expect(html).toContain(tr.previewBannerText);
    expect(html).toContain(`>${tr.draftBadge}<`);
    expect(html).toContain(tr.previewCardTitle);
    expect(html).toContain(tr.previewCardText);
    expect(html).toContain("12 Ekim Pazartesi 21:00");
    expect(html).not.toContain("19 Ekim");
  });

  it("offers no way to apply, whatever the course's own settings say", async () => {
    const html = await render("DRAFT", "http://nazar.test");
    for (const label of [tr.enroll, tr.requestEnroll, tr.signInToApply]) {
      expect(html).not.toContain(`>${label}<`);
    }
  });

  it("'Düzenlemeye dön' goes to Nazar, and is left out when there is no Nazar", async () => {
    const withNazar = await render("DRAFT", "http://nazar.test");
    expect(withNazar).toContain('href="http://nazar.test"');
    expect(withNazar).toContain(`>${tr.backToEditing}<`);
    const without = await render("DRAFT");
    expect(without).not.toContain(`>${tr.backToEditing}<`);
  });

  it("a published course shows none of it", async () => {
    const html = await render("PUBLISHED", "http://nazar.test");
    expect(html).not.toContain(tr.previewBannerText);
    expect(html).not.toContain(tr.previewCardTitle);
    expect(html).toContain(`>${tr.enroll}</button>`);
  });
});

describe("the new strings are in every catalogue", () => {
  it("has the same SystemPages, preview and window keys in tr, en and ar", () => {
    for (const locale of ["tr", "en", "ar"] as const) {
      const t = resources[locale].tedris;
      for (const key of [
        "receivedTitle",
        "receivedBody",
        "receivedNote",
        "receivedOk",
        "previewBannerText",
        "draftBadge",
        "backToEditing",
      ] as const) {
        expect(t.CoursePage[key], `${locale}.CoursePage.${key}`).toBeTruthy();
      }
      for (const key of Object.keys(resources.tr.tedris.SystemPages)) {
        expect(
          (t.SystemPages as Record<string, string>)[key],
          `${locale}.SystemPages.${key}`
        ).toBeTruthy();
      }
      expect(t.Auth.signOutCancel).toBeTruthy();
    }
  });
});
