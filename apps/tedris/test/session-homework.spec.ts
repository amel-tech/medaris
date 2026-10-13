import type {
  CourseDetailResponse,
  SessionResponse,
} from "@medaris/services/tedrisat";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

/**
 * Where "Ödevim" is drawn on a celse's detail page (MDRS-290): for a talebe
 * who may hand in, on the notes' terms (enrolled or completed, the content
 * open, the celse not cancelled), whether or not the celse has something to
 * watch; in the page's one column after "Notlarım" and before "Gündem" and
 * "Kaynaklar" (MDRS-289). What the card does is `homework-card.spec.ts`.
 */

vi.mock("next-intl/server", () => ({
  getTranslations: async () =>
    Object.assign((key: string) => key, {
      rich: (key: string) => key,
    }),
  getLocale: async () => "tr",
  getTimeZone: async () => "Europe/Istanbul",
}));
vi.mock("@medaris/ui/mds/toast", () => ({
  useToaster: () => ({ notify: () => "", dismiss: () => {} }),
}));
vi.mock("~/lib/i18n/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock("~/features/courses/components/session-action-card", () => ({
  SessionActionCard: () => createElement("div", { "data-join-card": "" }),
}));
vi.mock("~/features/courses/components/lesson-notes", () => ({
  LessonNotes: ({ lessonId }: { lessonId: string }) =>
    createElement("div", { "data-notes": lessonId }),
}));
vi.mock("~/features/courses/components/session-homework", () => ({
  SessionHomework: ({
    lessonId,
    assignment,
  }: {
    lessonId: string;
    assignment: { id: string } | null;
  }) =>
    createElement("div", {
      "data-homework": lessonId,
      ...(assignment ? { "data-assignment": assignment.id } : {}),
    }),
}));

const NOW = new Date("2026-10-03T17:52:00.000Z");
const AHEAD = new Date(NOW.getTime() + 2 * 3_600_000);

const course = (enrollment?: { status: string }) =>
  ({
    id: "c1",
    koskId: "k1",
    title: "Emsile ve Bina",
    timeZone: "Europe/Istanbul",
    weeks: [],
    contentLocked: false,
    enrollment,
  }) as unknown as CourseDetailResponse;

const session = (over: Record<string, unknown> = {}) =>
  ({
    id: "s1",
    courseId: "c1",
    weekId: "w5",
    weekNumber: 5,
    weekTitle: "Mehmûz fiiller",
    title: "Celse",
    startsAt: AHEAD,
    durationMinutes: 60,
    status: "SCHEDULED",
    cancelledAt: null,
    replacement: null,
    meetingUrl: "https://zoom.us/j/741852963",
    agenda: [],
    previous: null,
    next: null,
    muderris: [],
    contentLocked: false,
    ...over,
  }) as unknown as SessionResponse;

const RECORDED = session({
  status: "ENDED",
  startsAt: new Date(NOW.getTime() - 86_400_000),
  recording: {
    id: "r1",
    title: "Celse kaydı",
    provider: "YOUTUBE",
    url: "https://youtu.be/rec456abc",
    durationMinutes: 58,
    recordedAt: new Date("2026-10-02T18:00:00Z"),
    visibility: "ENROLLED",
    status: "READY",
  },
});

const render = async (c: CourseDetailResponse, s: SessionResponse) => {
  const { SessionPage } = await import(
    "~/features/courses/components/session-page"
  );
  return renderToStaticMarkup(
    await SessionPage({ course: c, session: s, koskName: null, now: NOW })
  );
};

describe("Ödevim on the celse's detail page (MDRS-290)", () => {
  it.each([
    ["an enrolled talebe", "ENROLLED"],
    ["a talebe who completed the course", "COMPLETED"],
  ])("is drawn once for %s, for the celse it is on", async (_label, status) => {
    const html = await render(course({ status }), session());
    expect(html.match(/data-homework="/g)).toHaveLength(1);
    expect(html).toContain('data-homework="s1"');
  });

  it("comes after the notes and before Gündem and Kaynaklar, the neighbours last", async () => {
    const html = await render(
      course({ status: "ENROLLED" }),
      session({
        kaynak: "Bina · s. 4",
        agenda: [{ time: "21:00", title: "Mezîd fiiller" }],
        next: {
          id: "s2",
          title: "Sonraki",
          weekNumber: 6,
          startsAt: AHEAD,
          status: "SCHEDULED",
        },
      })
    );
    const order = [
      "data-join-card",
      'data-notes="s1"',
      'data-homework="s1"',
      'id="agenda-title"',
      'data-testid="session-resources-card"',
      'aria-label="SessionPage.neighbours"',
    ].map((needle) => html.indexOf(needle));
    expect(order.every((i) => i > -1)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(html).toContain(
      '<div data-notes="s1"></div><div data-homework="s1"></div>'
    );
  });

  it("is handed the homework the müderris set, which never reaches Kaynaklar", async () => {
    const html = await render(
      course({ status: "ENROLLED" }),
      session({
        assignment: {
          id: "a1",
          lessonId: "s1",
          description: "Çekin.",
          files: [
            {
              id: "f1",
              name: "yonerge.pdf",
              contentType: "application/pdf",
              sizeBytes: 1024,
              createdAt: NOW,
              downloadUrl: "/lessons/s1/assignment/files/f1",
            },
          ],
          createdAt: NOW,
          updatedAt: NOW,
        },
        resources: [],
      })
    );
    expect(html).toContain('data-homework="s1" data-assignment="a1"');
    expect(html).not.toContain("session-resources-card");
    expect(html).not.toContain("yonerge.pdf");
  });

  it("is handed no homework on a celse without any, and decides itself whether to draw", async () => {
    const html = await render(course({ status: "ENROLLED" }), session());
    expect(html).toContain('<div data-homework="s1"></div>');
  });

  it("stays on the detail page of a celse with a recording, where the notes are on the watch page", async () => {
    const html = await render(course({ status: "ENROLLED" }), RECORDED);
    expect(html).not.toContain("data-notes");
    expect(html).toContain(
      '<div data-join-card=""></div><div data-homework="s1">'
    );
  });

  it("is not drawn on a cancelled celse", async () => {
    const html = await render(
      course({ status: "ENROLLED" }),
      session({
        status: "CANCELLED",
        cancelledAt: new Date(NOW.getTime() - 86_400_000),
      })
    );
    expect(html).not.toContain("data-homework");
  });

  it("is not drawn when the content is locked", async () => {
    const html = await render(
      course({ status: "ENROLLED" }),
      session({ contentLocked: true })
    );
    expect(html).not.toContain("data-homework");
  });

  it.each([
    ["a pending applicant", { status: "PENDING" }],
    ["a revoked talebe", { status: "REVOKED" }],
    ["someone with no enrollment (the müderris, a visitor)", undefined],
  ])("is not drawn for %s", async (_label, enrollment) => {
    for (const s of [session(), RECORDED]) {
      expect(await render(course(enrollment), s)).not.toContain(
        "data-homework"
      );
    }
  });
});
