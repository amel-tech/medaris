import type {
  CourseDetailResponse,
  SessionResponse,
} from "@medaris/services/tedrisat";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

/**
 * Where the notes panel is drawn on the session page, now the celse's detail
 * page (MDRS-150, MDRS-266, MDRS-285): for an enrolled talebe, under the join
 * card, on the celse's clock, whenever the celse has nothing to watch now;
 * when it has a stream or a READY recording, beside the video on the watch
 * page (`watch-view.spec.ts`) and not here. On a cancelled celse and for
 * everyone else, nowhere. What the panel does is `lesson-notes.spec.ts`.
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
vi.mock("~/features/courses/components/live-chat", () => ({
  LiveChat: () => null,
}));
vi.mock("~/features/courses/components/session-programme", () => ({
  SessionProgramme: () => null,
}));
// The join card keeps its own clock (session-page.spec.ts); here only where it is.
vi.mock("~/features/courses/components/session-join-live", () => ({
  SessionJoinLive: () => createElement("div", { "data-join-card": "" }),
}));
// The panel is a client component with its own spec; here only where it is
// mounted and what it is given.
vi.mock("~/features/courses/components/lesson-notes", () => ({
  LessonNotes: ({
    lessonId,
    frameId,
    clock,
  }: {
    lessonId: string;
    frameId?: string | null;
    clock?: {
      startsAt: string | null;
      durationMinutes?: number;
      renderedAt: string;
    };
  }) =>
    createElement("div", {
      "data-notes": lessonId,
      "data-notes-frame": frameId ?? "manual",
      "data-notes-clock": clock
        ? `${clock.startsAt}|${clock.durationMinutes}|${clock.renderedAt}`
        : "video",
    }),
}));

const NOW = new Date("2026-10-03T17:52:00.000Z");

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
    startsAt: new Date(NOW.getTime() - 14 * 60_000),
    durationMinutes: 60,
    status: "LIVE",
    cancelledAt: null,
    replacement: null,
    meetingUrl: null,
    agenda: [],
    previous: null,
    next: null,
    muderris: [],
    contentLocked: false,
    ...over,
  }) as unknown as SessionResponse;

const recording = (over: Record<string, unknown> = {}) => ({
  id: "r1",
  title: "Celse kaydı",
  provider: "YOUTUBE",
  url: "https://youtu.be/rec456abc",
  durationMinutes: 58,
  recordedAt: new Date("2026-09-26T18:00:00Z"),
  visibility: "ENROLLED",
  status: "READY",
  ...over,
});

const LIVE = session({
  liveStreamUrl: "https://www.youtube.com/watch?v=live123abc",
});
const ENDED = (over: Record<string, unknown> = {}) =>
  session({ status: "ENDED", recording: recording(over) });

const render = async (c: CourseDetailResponse, s: SessionResponse) => {
  const { SessionPage } = await import(
    "~/features/courses/components/session-page"
  );
  return renderToStaticMarkup(
    await SessionPage({ course: c, session: s, koskName: null, now: NOW })
  );
};

describe("the notes panel beside a video, on the watch page (MDRS-285)", () => {
  const BUNNY =
    "https://player.mediadelivery.net/embed/424242/3f1c2b4a-5d6e-4f70-8a9b-0c1d2e3f4a5b?token=9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08&expires=1790000000";

  it.each([
    ["a live stream", LIVE],
    [
      "a live stream that only opens at its host",
      session({ liveStreamUrl: "https://www.twitch.tv/medrese" }),
    ],
    [
      "a stream past its scheduled end, still sent by the API",
      session({
        status: "ENDED",
        liveStreamUrl: "https://www.youtube.com/watch?v=live123abc",
      }),
    ],
    ["a YouTube recording", ENDED()],
    [
      "a Drive recording",
      ENDED({
        provider: "DRIVE",
        url: "https://drive.google.com/file/d/abcDEF123456/view",
      }),
    ],
    ["a Bunny recording", ENDED({ provider: "BUNNY", url: BUNNY })],
    [
      "a recording that only opens at its host",
      ENDED({ provider: "OTHER", url: "https://example.org/watch/1" }),
    ],
  ])("is not on the detail page of a celse with %s, nor any frame for it", async (_label, s) => {
    for (const status of ["ENROLLED", "COMPLETED"]) {
      const html = await render(course({ status }), s);
      expect(html).not.toContain("data-notes");
      expect(html).not.toContain("<iframe");
      expect(html).not.toContain("enablejsapi");
      expect(html).not.toContain("data-player-with-notes");
    }
  });

  it.each([
    ["a pending applicant", { status: "PENDING" }],
    ["a revoked talebe", { status: "REVOKED" }],
    ["someone with no enrollment (the müderris, a visitor)", undefined],
  ])("is not drawn for %s, and no frame either", async (_label, enrollment) => {
    for (const s of [LIVE, ENDED()]) {
      const html = await render(course(enrollment), s);
      expect(html).not.toContain("data-notes");
      expect(html).not.toContain("<iframe");
    }
  });

  it("is not drawn when the content is locked", async () => {
    const html = await render(
      course({ status: "ENROLLED" }),
      session({ contentLocked: true, liveStreamUrl: undefined })
    );
    expect(html).not.toContain("data-notes");
  });
});

describe("the notes panel on a celse with nothing to watch, on the detail page (MDRS-266)", () => {
  const ZOOM = "https://zoom.us/j/741852963";
  const AHEAD = new Date(NOW.getTime() + 2 * 3_600_000);
  const enrolled = course({ status: "ENROLLED" });

  /**
   * One panel, with no frame to read, handed the celse's clock (its start,
   * its length and the instant the page was rendered at), under the join card
   * in the page's main column, and no frame switched to the player API.
   */
  const expectUnderJoinCard = (html: string, s: SessionResponse) => {
    expect(html.match(/data-notes="/g)).toHaveLength(1);
    expect(html).toContain('data-notes-frame="manual"');
    expect(html).toContain(
      `data-notes-clock="${s.startsAt?.toISOString()}|60|${NOW.toISOString()}"`
    );
    const columns = html.indexOf(
      "grid-cols-[minmax(0,1fr)_var(--layout-aside)]"
    );
    const join = html.indexOf("data-join-card");
    const notes = html.indexOf('data-notes="s1"');
    expect(columns).toBeGreaterThan(-1);
    expect(join).toBeGreaterThan(columns);
    expect(notes).toBeGreaterThan(join);
    expect(notes).toBeLessThan(html.indexOf("<aside"));
    expect(html).not.toContain("enablejsapi");
  };

  it.each([
    [
      "a celse on a meeting link, before it starts",
      session({ status: "SCHEDULED", startsAt: AHEAD, meetingUrl: ZOOM }),
    ],
    [
      "a celse on a meeting link, while it is live",
      session({ meetingUrl: ZOOM }),
    ],
    [
      "a celse on a meeting link, over with no recording",
      session({ status: "ENDED", recording: null }),
    ],
    [
      "a celse over whose recording is still being prepared",
      session({
        status: "ENDED",
        recording: recording({ status: "PROCESSING", url: null }),
      }),
    ],
    [
      "an in-person celse, before it starts",
      session({ status: "SCHEDULED", startsAt: AHEAD, inPerson: true }),
    ],
    ["an in-person celse, while it is live", session({ inPerson: true })],
    [
      "a celse with a stream that has not started",
      session({ status: "SCHEDULED", startsAt: AHEAD, hasLiveStream: true }),
    ],
    [
      "a celse over whose stream the API no longer sends, with no recording",
      session({ status: "ENDED", hasLiveStream: true, liveStreamUrl: null }),
    ],
    [
      "a celse with nothing set yet",
      session({ status: "SCHEDULED", startsAt: AHEAD }),
    ],
  ])("is under the join card on %s", async (_label, s) => {
    expectUnderJoinCard(await render(enrolled, s), s);
  });

  it("is drawn for a completed talebe too", async () => {
    const s = session({ meetingUrl: ZOOM });
    expectUnderJoinCard(await render(course({ status: "COMPLETED" }), s), s);
  });

  it("comes after the agenda beside the join card, before the neighbours", async () => {
    const html = await render(
      enrolled,
      session({
        meetingUrl: ZOOM,
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
    const notes = html.indexOf('data-notes="s1"');
    expect(notes).toBeGreaterThan(html.indexOf('id="agenda-title"'));
    expect(notes).toBeLessThan(
      html.indexOf('aria-label="SessionPage.neighbours"')
    );
  });

  it("has no clock to read on a celse without a time", async () => {
    const html = await render(enrolled, session({ startsAt: null }));
    expect(html.match(/data-notes="/g)).toHaveLength(1);
    expect(html).toContain(`data-notes-clock="null|60|${NOW.toISOString()}"`);
  });

  it("is not drawn on a cancelled celse", async () => {
    for (const over of [
      { meetingUrl: null },
      { inPerson: true },
      { hasLiveStream: true },
    ]) {
      const html = await render(
        enrolled,
        session({
          status: "CANCELLED",
          cancelledAt: new Date(NOW.getTime() - 86_400_000),
          startsAt: AHEAD,
          ...over,
        })
      );
      expect(html).not.toContain("data-notes");
    }
  });

  it.each([
    ["a pending applicant", { status: "PENDING" }],
    ["a revoked talebe", { status: "REVOKED" }],
    ["someone with no enrollment (the müderris, a visitor)", undefined],
  ])("is not drawn for %s", async (_label, enrollment) => {
    for (const s of [
      session({ status: "SCHEDULED", startsAt: AHEAD, meetingUrl: ZOOM }),
      session({ meetingUrl: ZOOM }),
      session({ inPerson: true }),
      session({ status: "ENDED", recording: null }),
    ]) {
      expect(await render(course(enrollment), s)).not.toContain("data-notes");
    }
  });

  it("is not drawn when the content is locked", async () => {
    const html = await render(
      enrolled,
      session({ status: "SCHEDULED", startsAt: AHEAD, contentLocked: true })
    );
    expect(html).not.toContain("data-notes");
  });
});
