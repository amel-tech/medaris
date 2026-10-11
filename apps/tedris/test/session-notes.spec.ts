import type {
  CourseDetailResponse,
  SessionResponse,
} from "@medaris/services/tedrisat";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

/**
 * Where the notes panel is drawn on the session page (MDRS-150): for an
 * enrolled talebe, under the video on screen, with the YouTube frame ready
 * for the player API; with no video, under the join card, on the celse's
 * clock (MDRS-266); on a cancelled celse and for everyone else, nowhere, and
 * the frames are the ones they always were. What the panel does is
 * `lesson-notes.spec.ts`.
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

describe("the notes panel on the session page", () => {
  it("sits under the live stream of an enrolled talebe, and the frame takes the player API", async () => {
    const html = await render(course({ status: "ENROLLED" }), LIVE);
    expect(html).toContain('data-notes="s1"');
    expect(html).toContain('data-notes-frame="live-stream-frame"');
    expect(html).toContain(
      'src="https://www.youtube-nocookie.com/embed/live123abc?enablejsapi=1"'
    );
    expect(html).toContain('id="live-stream-frame"');
    // the stream's position, not the clock (MDRS-266), and one panel only
    expect(html).toContain('data-notes-clock="video"');
    expect(html.match(/data-notes="/g)).toHaveLength(1);
  });

  it("sits under the recording of a finished session for a completed talebe", async () => {
    const html = await render(course({ status: "COMPLETED" }), ENDED());
    expect(html).toContain('data-notes="s1"');
    expect(html).toContain('data-notes-frame="recording-frame"');
    expect(html).toContain(
      'src="https://www.youtube-nocookie.com/embed/rec456abc?enablejsapi=1"'
    );
    expect(html).toContain('id="recording-frame"');
    expect(html).toContain('data-notes-clock="video"');
    expect(html.match(/data-notes="/g)).toHaveLength(1);
  });

  it("gives a finished session's recording the page's width, the notes under it, before the join card and the agenda (MDRS-280)", async () => {
    const html = await render(
      course({ status: "ENROLLED" }),
      session({
        status: "ENDED",
        recording: recording(),
        agenda: [{ time: "21:00", title: "Mezîd fiiller" }],
      })
    );
    const frame = html.indexOf('id="recording-frame"');
    const notes = html.indexOf('data-notes="s1"');
    const columns = html.indexOf(
      "grid-cols-[minmax(0,1fr)_var(--layout-aside)]"
    );
    expect(frame).toBeGreaterThan(-1);
    expect(notes).toBeGreaterThan(frame);
    // the block is outside the page's two columns, above them: it is as wide
    // as the page, and the join card, the agenda and the aside come after it
    const block = html.lastIndexOf("data-player-with-notes", frame);
    expect(block).toBeGreaterThan(-1);
    expect(columns).toBeGreaterThan(notes);
    expect(notes).toBeLessThan(html.indexOf('id="agenda-title"'));
  });

  it("keeps a live stream in the column after the join card, the notes under it (MDRS-280)", async () => {
    const html = await render(course({ status: "ENROLLED" }), LIVE);
    const frame = html.indexOf('id="live-stream-frame"');
    const notes = html.indexOf('data-notes="s1"');
    expect(notes).toBeGreaterThan(frame);
    const block = html.lastIndexOf("data-player-with-notes", frame);
    expect(block).toBeGreaterThan(
      html.indexOf("grid-cols-[minmax(0,1fr)_var(--layout-aside)]")
    );
    // nothing of the page between the stream's card and the panel
    expect(html.slice(frame, notes)).not.toContain("<section");
  });

  it("asks for a typed time on a Drive recording: no player API, no frame to read", async () => {
    const html = await render(
      course({ status: "ENROLLED" }),
      ENDED({
        provider: "DRIVE",
        url: "https://drive.google.com/file/d/abcDEF123456/view",
      })
    );
    expect(html).toContain('data-notes="s1"');
    expect(html).toContain('data-notes-frame="manual"');
    expect(html).toContain(
      'src="https://drive.google.com/file/d/abcDEF123456/preview"'
    );
    expect(html).not.toContain("enablejsapi");
  });

  it("asks for a typed time on a Bunny recording, framed on its signed link as it came (MDRS-114)", async () => {
    const signed =
      "https://player.mediadelivery.net/embed/424242/3f1c2b4a-5d6e-4f70-8a9b-0c1d2e3f4a5b?token=9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08&expires=1790000000";
    const html = await render(
      course({ status: "ENROLLED" }),
      ENDED({ provider: "BUNNY", url: signed })
    );
    expect(html).toContain('data-notes="s1"');
    expect(html).toContain('data-notes-frame="manual"');
    expect(html).toContain(`src="${signed.replaceAll("&", "&amp;")}"`);
    expect(html).not.toContain("enablejsapi");
  });

  it("asks for a typed time on a recording that only opens at its host", async () => {
    const html = await render(
      course({ status: "ENROLLED" }),
      ENDED({ provider: "OTHER", url: "https://example.org/watch/1" })
    );
    expect(html).toContain('data-notes-frame="manual"');
    expect(html).not.toContain("enablejsapi");
  });

  it.each([
    ["a pending applicant", { status: "PENDING" }],
    ["a revoked talebe", { status: "REVOKED" }],
    ["someone with no enrollment (the müderris, a visitor)", undefined],
  ])("is not drawn for %s, and their frame is unchanged", async (_label, enrollment) => {
    const live = await render(course(enrollment), LIVE);
    expect(live).not.toContain("data-notes");
    expect(live).toContain(
      'src="https://www.youtube-nocookie.com/embed/live123abc"'
    );
    expect(live).not.toContain("enablejsapi");

    const ended = await render(course(enrollment), ENDED());
    expect(ended).not.toContain("data-notes");
    expect(ended).not.toContain("enablejsapi");
  });

  it("is not drawn when the content is locked", async () => {
    const html = await render(
      course({ status: "ENROLLED" }),
      session({ contentLocked: true, liveStreamUrl: undefined })
    );
    expect(html).not.toContain("data-notes");
  });
});

describe("the notes panel on a celse with no video on screen (MDRS-266)", () => {
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
      "a live celse whose stream only opens at its host",
      session({ liveStreamUrl: "https://www.twitch.tv/medrese" }),
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
