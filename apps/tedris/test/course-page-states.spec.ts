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
  updateCourseProgress: vi.fn(),
}));

// 3 Ekim 2026 Cumartesi 12:00 İstanbul.
const NOW = Date.parse("2026-10-03T09:00:00Z");
const MEETING = "https://zoom.us/j/1";
const tr = resources.tr.tedris.CoursePage;

type Status = "PENDING" | "ENROLLED" | "COMPLETED" | "REVOKED" | null;

const lesson = (
  id: string,
  at: string,
  extra: Record<string, unknown> = {}
) => ({
  id,
  weekId: "w",
  title: id,
  type: "LIVE",
  scheduledAt: new Date(at),
  durationMinutes: 60,
  isPreview: false,
  orderIndex: 0,
  cancelledAt: null,
  replacementLessonId: null,
  ...extra,
});

const course = (status: Status, contentLocked: boolean) =>
  ({
    id: "c1000000-0000-4000-8000-000000000001",
    koskId: "c1000000-0000-4000-8000-000000000002",
    title: "Bina ve İzhar Şerhi",
    subtitle: null,
    description: "Bina, sarf metnidir.",
    category: null,
    level: "BEGINNER",
    language: null,
    coverHue: 145,
    status: "PUBLISHED",
    requiresApproval: true,
    grantsCertificate: false,
    timeZone: "Europe/Istanbul",
    madrasah: { id: "m1", name: "Süleymaniye Medresesi" },
    weeks: [
      {
        id: "w1",
        weekNumber: 1,
        title: "Giriş",
        summary: null,
        lessons: [
          lesson("sample", "2026-09-26T18:00:00Z", {
            isPreview: true,
            kaynak: "Binâü’l-ef’âl, s. 1–6",
            agenda: [{ time: "21:00", title: "Tanışma ve dersin işleyişi" }],
          }),
        ],
      },
      {
        id: "w2",
        weekNumber: 2,
        title: "Mastar",
        summary: null,
        lessons: [
          lesson("next", "2026-10-04T18:00:00Z", {
            ...(contentLocked ? {} : { meetingUrl: null }),
          }),
          lesson("iptal", "2026-10-05T18:00:00Z", {
            cancelledAt: new Date("2026-10-01T10:00:00Z"),
          }),
        ],
      },
      {
        id: "w3",
        weekNumber: 3,
        title: "Sahih",
        summary: null,
        lessons: [lesson("later", "2026-10-11T18:00:00Z")],
      },
    ],
    muderris: [
      {
        id: "m",
        name: "Abdülhamit Karaosmanoğlu",
        title: "İmam",
        bio: null,
        avatarHue: 200,
      },
    ],
    resources: [],
    enrollment:
      status === null
        ? null
        : {
            status,
            progress: 40,
            createdAt: new Date("2026-10-03T07:02:00Z"),
          },
    contentLocked,
  }) as unknown as CourseDetailResponse;

const render = async (
  status: Status,
  props: { signedIn?: boolean; approvalRequired?: boolean } = {}
) => {
  const { CoursePage } = await import(
    "~/features/courses/components/course-page"
  );
  const seat = status === "ENROLLED" || status === "COMPLETED";
  return renderToStaticMarkup(
    createElement(CoursePage, {
      course: course(status, !seat),
      koskName: "Nûruosmaniye Köşkü",
      signedIn: true,
      now: NOW,
      ...props,
    })
  );
};

describe("tedris/05: a visitor", () => {
  it("is asked to sign in or register, and sees every week locked", async () => {
    const html = await render(null, { signedIn: false });
    expect(html).toContain(tr.signInToApply);
    expect(html).toContain("Hesabın yok mu?");
    expect(html.match(/, kilitli/g)).toHaveLength(3);
    expect(html).not.toContain(tr.apply);
  });

  it("reads the sample session's agenda and source, and nothing of the meeting", async () => {
    const html = await render(null, { signedIn: false });
    expect(html).toContain('id="ornek-celse"');
    expect(html).toContain("Tanışma ve dersin işleyişi");
    expect(html).toContain("Binâü’l-ef’âl, s. 1–6");
    expect(html).not.toContain(MEETING);
  });

  it("names the next session with its day, behind the lock notice", async () => {
    const html = await render(null, { signedIn: false });
    expect(html).toContain("yarın");
    expect(html).toContain(tr.lockedNotice);
  });

  it("says the times are in the course's zone", async () => {
    expect(await render(null, { signedIn: false })).toContain(
      "saatler İstanbul saatiyle"
    );
  });
});

describe("tedris/06: signed in, no seat", () => {
  it("offers to apply when approval is required, and to enroll when it is not", async () => {
    const asked = await render(null, { approvalRequired: true });
    expect(asked).toContain(`>${tr.apply}</button>`);
    expect(asked).toContain(tr.applyNote);
    const open = await render(null, { approvalRequired: false });
    expect(open).toContain(`>${tr.enroll}</button>`);
    expect(open).not.toContain(tr.applyNote);
  });
});

describe("tedris/08: waiting for approval", () => {
  it("shows the badge, when the application was sent, and the way to withdraw it", async () => {
    const html = await render("PENDING");
    expect(html).toContain(tr.pendingApproval);
    expect(html).toContain("Başvurun bugün 10:02 ders kadrosuna iletildi");
    expect(html).toContain(tr.withdrawRequest);
    expect(html).not.toContain(`>${tr.apply}</button>`);
    expect(html).not.toContain(MEETING);
  });
});

describe("tedris/12: an enrolled talebe", () => {
  it("shows the next session, the progress and the way on", async () => {
    const html = await render("ENROLLED");
    expect(html).toContain(tr.statusInProgress);
    expect(html).toContain(tr.meetingNotAdded);
    expect(html).toContain(`>${tr.continue}</a>`);
    expect(html).toContain("%40");
    expect(html).toContain(tr.updateProgress);
    expect(html).toContain(tr.tabDeck);
  });

  it("marks a cancelled session and says when a week that has not begun opens", async () => {
    const html = await render("ENROLLED");
    expect(html).toContain(tr.cancelledBadge);
    expect(html).toContain("11 Ekim");
    expect(html).not.toContain(tr.signInToApply);
  });

  it("has no way to update progress or leave once the course is completed", async () => {
    const html = await render("COMPLETED");
    expect(html).toContain(tr.statusCompleted);
    expect(html).not.toContain(tr.updateProgress);
    expect(html).not.toContain(tr.leaveCourse);
  });
});

describe("tedris/13: access withdrawn", () => {
  it("says so, offers the way back, and does not offer to apply", async () => {
    const html = await render("REVOKED");
    expect(html).toContain(tr.revokedTitle);
    expect(html).toContain(tr.revokedBody);
    expect(html).toContain(tr.backToMyCourses);
    expect(html).toContain('href="/my-courses"');
    expect(html).not.toContain(`>${tr.apply}</button>`);
    expect(html).not.toContain(tr.tabDeck);
    expect(html).not.toContain("ornek-celse");
    expect(html).not.toContain(tr.nextSession);
  });

  it("keeps the programme, every week locked", async () => {
    const html = await render("REVOKED");
    expect(html.match(/, kilitli/g)).toHaveLength(3);
  });
});

describe("the new keys", () => {
  it("exist in every locale", () => {
    for (const locale of ["tr", "en", "ar"] as const) {
      const page = resources[locale].tedris.CoursePage as Record<
        string,
        string
      >;
      for (const key of Object.keys(tr)) {
        expect(page[key], `${locale}.${key}`).toBeTruthy();
      }
    }
  });
});
