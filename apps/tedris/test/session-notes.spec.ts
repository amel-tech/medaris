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
 * for the player API; for everyone else, nowhere, and the frames are the ones
 * they always were. What the panel does is `lesson-notes.spec.ts`.
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
vi.mock("~/features/courses/components/session-join-live", () => ({
  SessionJoinLive: () => null,
}));
// The panel is a client component with its own spec; here only where it is mounted.
vi.mock("~/features/courses/components/lesson-notes", () => ({
  LessonNotes: ({
    lessonId,
    frameId,
  }: {
    lessonId: string;
    frameId?: string | null;
  }) =>
    createElement("div", {
      "data-notes": lessonId,
      "data-notes-frame": frameId ?? "manual",
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
  });

  it("sits under the recording of a finished session for a completed talebe", async () => {
    const html = await render(course({ status: "COMPLETED" }), ENDED());
    expect(html).toContain('data-notes="s1"');
    expect(html).toContain('data-notes-frame="recording-frame"');
    expect(html).toContain(
      'src="https://www.youtube-nocookie.com/embed/rec456abc?enablejsapi=1"'
    );
    expect(html).toContain('id="recording-frame"');
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

  it("is not drawn when there is no video to take notes on", async () => {
    const enrolled = course({ status: "ENROLLED" });
    expect(
      await render(enrolled, session({ liveStreamUrl: null }))
    ).not.toContain("data-notes");
    expect(
      await render(enrolled, session({ status: "ENDED", recording: null }))
    ).not.toContain("data-notes");
    expect(
      await render(
        enrolled,
        session({
          status: "ENDED",
          recording: recording({ status: "PROCESSING", url: null }),
        })
      )
    ).not.toContain("data-notes");
    expect(
      await render(
        enrolled,
        session({
          status: "SCHEDULED",
          startsAt: new Date(NOW.getTime() + 3_600_000),
        })
      )
    ).not.toContain("data-notes");
  });
});
