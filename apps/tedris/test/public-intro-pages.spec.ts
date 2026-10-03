import { resources } from "@medaris/i18n";
import type { CourseDetailResponse } from "@medaris/services/tedrisat";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { introMetadata } from "~/features/courses/intro-metadata";

// The client hooks the course page uses, resolved without a Next request:
// the real catalogue (no interpolation), a router nobody calls, no actions.
vi.mock("next-intl", async () => {
  const { resources } = await import("@medaris/i18n");
  return {
    useLocale: () => "tr",
    useTranslations: (namespace: string) => {
      const read = (key: string) =>
        [...namespace.split("."), ...key.split(".")].reduce<unknown>(
          (node, part) => (node as Record<string, unknown>)?.[part],
          resources.tr
        );
      return Object.assign((key: string) => read(key), {
        rich: (key: string) => read(key),
      });
    },
  };
});
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh() {} }) }));
vi.mock("~/features/courses/actions", () => ({
  enrollInCourse: vi.fn(),
  leaveCourse: vi.fn(),
}));

const COURSE_ID = "c1000000-0000-4000-8000-000000000001";

const course = {
  id: COURSE_ID,
  koskId: "c1000000-0000-4000-8000-000000000002",
  title: "Bina ve İzhar Şerhi",
  subtitle: null,
  description: null,
  category: null,
  level: "BEGINNER",
  language: null,
  coverHue: 145,
  requiresApproval: false,
  grantsCertificate: false,
  timeZone: "Europe/Istanbul",
  weeks: [],
  muderris: [],
  resources: [],
  enrollment: null,
  contentLocked: true,
} as unknown as CourseDetailResponse;

const renderCard = async (props: {
  signedIn: boolean;
  approvalRequired?: boolean;
}) => {
  const { CoursePage } = await import(
    "~/features/courses/components/course-page"
  );
  return renderToStaticMarkup(createElement(CoursePage, { course, ...props }));
};

describe("course page sticky card (MDRS-122)", () => {
  const tr = resources.tr.tedris.CoursePage;

  it("asks a signed-out visitor to sign in, and comes back to this course", async () => {
    const html = await renderCard({ signedIn: false });
    expect(html).toContain(tr.signInToApply);
    expect(html).toContain(
      `callbackUrl=${encodeURIComponent(`/courses/${COURSE_ID}`)}`
    );
    expect(html).not.toContain(`>${tr.enroll}</button>`);
  });

  it("offers a signed-in visitor to enroll, or to request it when approval is required", async () => {
    expect(await renderCard({ signedIn: true })).toContain(
      `>${tr.enroll}</button>`
    );
    expect(
      await renderCard({ signedIn: true, approvalRequired: true })
    ).toContain(`>${tr.apply}</button>`);
  });

  it("has the new key in every locale", () => {
    for (const locale of ["tr", "en", "ar"] as const) {
      expect(resources[locale].tedris.CoursePage.signInToApply).toBeTruthy();
    }
  });
});

describe("intro page metadata (MDRS-122)", () => {
  const metadataBase = new URL("https://tedris.medaris.test");

  it("names the köşk, medrese or course and fills Open Graph", () => {
    const metadata = introMetadata({
      subject: {
        title: "Süleymaniye Köşkü",
        description: "Klasik  medrese.\n",
      },
      path: "/tr/kosks/k-1",
      siteName: "Tedris",
      metadataBase,
    });
    expect(metadata).toMatchObject({
      title: "Süleymaniye Köşkü · Tedris",
      description: "Klasik medrese.",
      metadataBase,
      alternates: { canonical: "/tr/kosks/k-1" },
      openGraph: {
        type: "website",
        siteName: "Tedris",
        title: "Süleymaniye Köşkü",
        description: "Klasik medrese.",
        url: "/tr/kosks/k-1",
      },
    });
  });

  it("falls back to the site title when a caller with no token got nothing — an unlisted köşk names nothing", () => {
    const metadata = introMetadata({
      subject: null,
      path: "/tr/kosks/k-2",
      siteName: "Tedris",
      metadataBase,
    });
    expect(metadata).toEqual({ title: "Tedris", metadataBase });
  });

  it("shortens a long description for link previews", () => {
    const metadata = introMetadata({
      subject: { title: "Kurs", description: "a".repeat(500) },
      path: "/tr/courses/c-1",
      siteName: "Tedris",
      metadataBase,
    });
    expect(String(metadata.description)).toHaveLength(200);
    expect(String(metadata.description).endsWith("…")).toBe(true);
  });
});
