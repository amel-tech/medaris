import { resources } from "@medaris/i18n";
import type {
  CourseDetailResponse,
  SessionResponse,
} from "@medaris/services/tedrisat";
import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WatchVideo } from "~/features/courses/components/watch-view";
import type { ReleaseWords } from "~/features/courses/recordings-model";
import type { WatchTarget } from "~/features/courses/watch-model";

/**
 * The watch page's server half (MDRS-285): the route sends whoever has
 * nothing to watch to the detail page, with the detail page's gating, and
 * the page works out what plays for this viewer. What the page then draws
 * and how its panel follows the player is `watch-view.spec.ts`.
 */

const mocks = vi.hoisted(() => ({
  getCourse: vi.fn(),
  getSession: vi.fn(),
  auth: vi.fn(),
  /** The viewer's zone. */
  timeZone: { current: "Europe/Istanbul" },
}));

vi.mock("next-intl/server", () => ({
  getLocale: async () => "tr",
  getTimeZone: async () => mocks.timeZone.current,
  getTranslations: async (namespace: string) => {
    const messages = namespace
      .split(".")
      .reduce<unknown>(
        (node, part) => (node as Record<string, unknown>)?.[part],
        resources.tr
      ) as Record<string, string>;
    return (key: string, values?: Record<string, string | number>) =>
      messages[key].replace(/\{(\w+)\}/g, (_, name) =>
        String(values?.[name] ?? "")
      );
  },
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { url });
  },
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));
vi.mock("~/features/courses/actions", () => ({ getCourse: mocks.getCourse }));
vi.mock("~/features/courses/public-reads", () => ({
  getSession: mocks.getSession,
}));
vi.mock("~/lib/auth", () => ({ auth: mocks.auth }));
// The client half has its own spec; here only what it is given.
vi.mock("~/features/courses/components/watch-view", () => ({
  WatchView: () => null,
}));

const STREAM = "https://www.youtube.com/live/ybHyHDBiRoE";
const BUNNY =
  "https://player.mediadelivery.net/embed/424242/3f1c2b4a-5d6e-4f70-8a9b-0c1d2e3f4a5b?token=9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08&expires=1790000000";
const NOW = new Date("2026-10-03T19:30:00.000Z");

const course = (over: Record<string, unknown> = {}) =>
  ({
    id: "c1",
    koskId: "k1",
    title: "Emsile ve Bina",
    timeZone: "Europe/Istanbul",
    weeks: [],
    contentLocked: false,
    enrollment: { status: "ENROLLED" },
    ...over,
  }) as unknown as CourseDetailResponse;

const session = (over: Record<string, unknown> = {}) =>
  ({
    id: "s1",
    courseId: "c1",
    weekNumber: 3,
    title: "Mehmûz fiiller",
    startsAt: new Date("2026-10-03T18:00:00.000Z"),
    durationMinutes: 60,
    status: "ENDED",
    inPerson: false,
    contentLocked: false,
    liveStreamUrl: STREAM,
    recording: null,
    muderris: [],
    ...over,
  }) as unknown as SessionResponse;

const recording = (over: Record<string, unknown> = {}) => ({
  id: "r1",
  title: "Mehmûz fiiller (kayıt)",
  recordedAt: new Date("2026-10-03T18:00:00.000Z"),
  durationMinutes: 58,
  provider: "YOUTUBE",
  url: "https://www.youtube.com/watch?v=abcdefgh",
  visibility: "ENROLLED",
  status: "READY",
  ...over,
});

interface ViewProps {
  courseId: string;
  lessonId: string;
  weekNumber: number;
  title: string;
  startsAt: string | null;
  renderedAt: string;
  video: WatchVideo;
  release: ReleaseWords | null;
  notes: boolean;
  questions: boolean;
}

const watch = async (
  c: CourseDetailResponse,
  s: SessionResponse,
  target: WatchTarget
) => {
  const { WatchPage } = await import(
    "~/features/courses/components/watch-page"
  );
  const el = (await WatchPage({
    course: c,
    session: s,
    target,
    now: NOW,
  })) as ReactElement<ViewProps>;
  return el.props;
};

describe("WatchPage: what plays for this viewer", () => {
  it("frames a stream with the player API on, for a talebe and for anyone else", async () => {
    for (const enrollment of [{ status: "ENROLLED" }, undefined]) {
      const props = await watch(course({ enrollment }), session(), {
        kind: "stream",
        url: STREAM,
      });
      expect(props.video).toEqual({
        kind: "stream",
        url: STREAM,
        embedUrl: "https://www.youtube.com/embed/ybHyHDBiRoE?enablejsapi=1",
      });
    }
  });

  it("lets an enrolled talebe take notes and ask, and nobody else", async () => {
    const target: WatchTarget = { kind: "stream", url: STREAM };
    const talebe = await watch(course(), session(), target);
    expect([talebe.notes, talebe.questions]).toEqual([true, true]);
    for (const enrollment of [undefined, { status: "PENDING" }]) {
      const other = await watch(course({ enrollment }), session(), target);
      expect([other.notes, other.questions]).toEqual([false, false]);
    }
  });

  it("hands over the celse and the instant it rendered at", async () => {
    const props = await watch(course(), session(), {
      kind: "stream",
      url: STREAM,
    });
    expect(props).toMatchObject({
      courseId: "c1",
      lessonId: "s1",
      weekNumber: 3,
      title: "Mehmûz fiiller",
      startsAt: "2026-10-03T18:00:00.000Z",
      renderedAt: NOW.toISOString(),
    });
  });

  it("hands over no meeting link: the Zoom link is on the detail page only (owner's decision 6)", async () => {
    const zoom = "https://zoom.us/j/123456789";
    const live = session({ status: "LIVE", meetingUrl: zoom });
    for (const target of [
      { kind: "stream", url: STREAM },
      { kind: "recording", recording: recording() },
    ] as WatchTarget[]) {
      const props = await watch(course(), live, target);
      expect(JSON.stringify(props)).not.toContain("zoom.us");
    }
  });

  it("frames a YouTube recording with the player API for a talebe's notes, and says what it is", async () => {
    const rec = recording();
    const props = await watch(course(), session(), {
      kind: "recording",
      recording: rec as never,
    });
    expect(props.video).toEqual({
      kind: "recording",
      title: "Mehmûz fiiller (kayıt)",
      embedUrl: "https://www.youtube.com/embed/abcdefgh?enablejsapi=1",
      openUrl: rec.url,
      bunny: false,
      facts: "Ders kaydı · 3 Ekim 2026 · 58 dk",
      reportsPosition: true,
    });
  });

  it("leaves a YouTube recording's frame as it is for a viewer who takes no notes", async () => {
    const props = await watch(course({ enrollment: undefined }), session(), {
      kind: "recording",
      recording: recording() as never,
    });
    expect(props.video).toMatchObject({
      embedUrl: "https://www.youtube.com/embed/abcdefgh",
      reportsPosition: false,
    });
  });

  it("plays a Bunny recording in the link signed for this viewer; it reports no position", async () => {
    const props = await watch(course(), session(), {
      kind: "recording",
      recording: recording({
        provider: "BUNNY",
        url: BUNNY,
        recordedAt: null,
        durationMinutes: null,
      }) as never,
    });
    expect(props.video).toEqual({
      kind: "recording",
      title: "Mehmûz fiiller (kayıt)",
      embedUrl: BUNNY,
      openUrl: BUNNY,
      bunny: true,
      facts: "Ders kaydı",
      reportsPosition: false,
    });
  });
});

describe("WatchPage: a recording held back until its release time (MDRS-288)", () => {
  // 14 Ekim 2026 Çarşamba 20:00 in İstanbul, after NOW.
  const AT = new Date("2026-10-14T17:00:00.000Z");
  beforeEach(() => {
    mocks.timeZone.current = "Europe/Istanbul";
  });

  it("tells a talebe beside the stream when the recording opens", async () => {
    const held = recording({ url: null, availableAt: AT });
    const props = await watch(course(), session({ recording: held }), {
      kind: "stream",
      url: STREAM,
    });
    expect(props.release).toEqual({
      text: "Ders kaydı 14 Ekim Çarşamba 20:00’de açılır.",
      zone: null,
    });
    expect(JSON.stringify(props)).not.toContain("abcdefgh");
  });

  it("marks the recording the course team plays early with the time talebe may", async () => {
    const early = recording({ availableAt: AT });
    const props = await watch(
      course({ enrollment: undefined }),
      session({ recording: early }),
      {
        kind: "recording",
        recording: early as never,
      }
    );
    expect(props.release?.text).toBe(
      "Talebelere 14 Ekim Çarşamba 20:00’de açılacak"
    );
    expect(props.video).toMatchObject({
      kind: "recording",
      embedUrl: "https://www.youtube.com/embed/abcdefgh",
    });
  });

  it("names the course's zone and the viewer's clock when that shows another time", async () => {
    mocks.timeZone.current = "Europe/Berlin";
    const props = await watch(
      course(),
      session({ recording: recording({ url: null, availableAt: AT }) }),
      { kind: "stream", url: STREAM }
    );
    expect(props.release?.zone).toBe(
      "İstanbul saatiyle · 19:00 senin saatinle"
    );
  });

  it("says nothing once the time has come, or with none ('Hazır olunca hemen')", async () => {
    for (const availableAt of [new Date("2026-10-03T19:00:00.000Z"), null]) {
      const rec = recording({ availableAt });
      const props = await watch(course(), session({ recording: rec }), {
        kind: "recording",
        recording: rec as never,
      });
      expect(props.release).toBeNull();
    }
  });
});

describe("the route", () => {
  beforeEach(() => {
    mocks.getCourse.mockReset().mockResolvedValue(course());
    mocks.getSession.mockReset().mockResolvedValue(session());
    mocks.auth.mockReset().mockResolvedValue({ user: { name: "Talebe" } });
  });

  const open = async () => {
    const { default: Page } = await import(
      "../app/courses/[courseId]/lessons/[lessonId]/izle/page"
    );
    return Page({
      params: Promise.resolve({ courseId: "c1", lessonId: "s1" }),
    });
  };
  const redirectOf = async () => {
    try {
      await open();
    } catch (error) {
      return (error as { url?: string }).url;
    }
    throw new Error("expected a redirect");
  };
  const DETAIL = "/courses/c1/lessons/s1";

  it("opens on a stream the API sent, after the clock's end too", async () => {
    const el = (await open()) as ReactElement<{ target: WatchTarget }>;
    expect(el.props.target).toEqual({ kind: "stream", url: STREAM });
    expect(mocks.getSession).toHaveBeenCalledWith("c1", "s1");
  });

  it("opens on a READY recording", async () => {
    const rec = recording();
    mocks.getSession.mockResolvedValue(
      session({ liveStreamUrl: null, recording: rec })
    );
    const el = (await open()) as ReactElement<{ target: WatchTarget }>;
    expect(el.props.target).toEqual({ kind: "recording", recording: rec });
  });

  it("opens on the READY recording of a cancelled celse, which the recordings tab leads to", async () => {
    const rec = recording();
    const cancelled = { status: "CANCELLED", cancelledAt: NOW };
    mocks.getSession.mockResolvedValue(
      session({ ...cancelled, liveStreamUrl: null, recording: rec })
    );
    const el = (await open()) as ReactElement<{ target: WatchTarget }>;
    expect(el.props.target).toEqual({ kind: "recording", recording: rec });
    // Without one it has nothing to watch.
    mocks.getSession.mockResolvedValue(
      session({ ...cancelled, liveStreamUrl: null })
    );
    expect(await redirectOf()).toBe(DETAIL);
  });

  it("sends the viewer to the detail page when there is nothing to watch", async () => {
    mocks.getSession.mockResolvedValue(session({ liveStreamUrl: null }));
    expect(await redirectOf()).toBe(DETAIL);
    mocks.getSession.mockResolvedValue(
      session({
        liveStreamUrl: null,
        recording: recording({ status: "PROCESSING", url: null }),
      })
    );
    expect(await redirectOf()).toBe(DETAIL);
  });

  it("plays the stream to a talebe, not the recording held back from them (MDRS-288)", async () => {
    const held = recording({
      url: null,
      availableAt: new Date("2026-10-14T17:00:00.000Z"),
    });
    mocks.getSession.mockResolvedValue(session({ recording: held }));
    const el = (await open()) as ReactElement<{ target: WatchTarget }>;
    expect(el.props.target).toEqual({ kind: "stream", url: STREAM });
    // Once tedrisat stops sending the stream, the detail page says when it opens.
    mocks.getSession.mockResolvedValue(
      session({ liveStreamUrl: null, recording: held })
    );
    expect(await redirectOf()).toBe(DETAIL);
  });

  it("plays the course team the recording before its release time (MDRS-288)", async () => {
    const early = recording({
      availableAt: new Date("2026-10-14T17:00:00.000Z"),
    });
    mocks.getSession.mockResolvedValue(session({ recording: early }));
    const el = (await open()) as ReactElement<{ target: WatchTarget }>;
    expect(el.props.target).toEqual({ kind: "recording", recording: early });
  });

  it("sends a viewer who may not read the content to the detail page's locked card", async () => {
    mocks.getCourse.mockResolvedValue(
      course({ contentLocked: true, enrollment: undefined })
    );
    mocks.getSession.mockResolvedValue(
      session({ contentLocked: true, liveStreamUrl: undefined })
    );
    expect(await redirectOf()).toBe(DETAIL);
    // Even were a link sent, the course's lock decides, as on the detail page.
    mocks.getSession.mockResolvedValue(session());
    expect(await redirectOf()).toBe(DETAIL);
  });

  it("is not found for an unknown celse", async () => {
    mocks.getSession.mockResolvedValue(null);
    await expect(open()).rejects.toThrow("NEXT_NOT_FOUND");
  });
});
