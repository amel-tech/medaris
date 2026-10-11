import { resources } from "@medaris/i18n";
import type {
  CourseDetailResponse,
  SessionResponse,
} from "@medaris/services/tedrisat";
import { createElement, Fragment, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// next-intl's server API without a request: the real catalogue, `{name}`
// placeholders filled in, `<tag>…</tag>` rich chunks passed to their function.
const lookup = (key: string, values?: Record<string, unknown>) => {
  const text = key
    .split(".")
    .reduce<unknown>(
      (node, part) => (node as Record<string, unknown>)?.[part],
      resources.tr.tedris
    ) as string;
  return Object.entries(values ?? {}).reduce(
    (acc, [k, v]) =>
      typeof v === "function" ? acc : acc.replace(`{${k}}`, String(v)),
    text
  );
};
const translate = Object.assign(lookup, {
  rich: (key: string, values: Record<string, unknown>) => {
    const parts = lookup(key, values).split(/<when>|<\/when>/);
    const when = values.when as (chunks: string) => ReactNode;
    return createElement(Fragment, null, parts[0], when(parts[1]), parts[2]);
  },
});
vi.mock("@medaris/ui/mds/toast", () => ({
  useToaster: () => ({ notify: () => "", dismiss: () => {} }),
}));
// `tedrisLearn.RecordingRelease` (MDRS-288) is the one other namespace the page reads.
const release = (key: string, values?: Record<string, string>) =>
  (resources.tr.tedrisLearn.RecordingRelease as Record<string, string>)[
    key
  ].replace(/\{(\w+)\}/g, (_, name: string) => values?.[name] ?? "");
// The viewer's zone, İstanbul unless a case says otherwise.
const viewer = vi.hoisted(() => ({ zone: "Europe/Istanbul" }));
vi.mock("next-intl/server", () => ({
  getTranslations: async (namespace?: string) =>
    namespace === "tedrisLearn.RecordingRelease" ? release : translate,
  getLocale: async () => "tr",
  getTimeZone: async () => viewer.zone,
}));
// The calendar menu routes through next-intl's navigation, which needs a mounted app router.
vi.mock("~/lib/i18n/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

beforeEach(() => {
  viewer.zone = "Europe/Istanbul";
});

const NOW = new Date("2026-10-03T17:52:00.000Z");
const at = (minutes: number) => new Date(NOW.getTime() + minutes * 60_000);
const tr = resources.tr.tedris.SessionPage;

// A Bunny player link as tedrisat signs it for one viewer (MDRS-119).
const BUNNY =
  "https://player.mediadelivery.net/embed/424242/3f1c2b4a-5d6e-4f70-8a9b-0c1d2e3f4a5b?token=9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08&expires=1790000000";

/** Markup without its tags, for a sentence that runs through several elements. */
const text = (html: string | undefined) =>
  (html ?? "").replace(/<[^>]+>/g, "").replaceAll("&#x27;", "'");

/** The buttons to the watch page (MDRS-285), as [text, href]. */
const watchButtons = (html: string) =>
  [
    ...html.matchAll(
      /<a class="mds-btn[^"]*" href="([^"]*\/izle)"[^>]*>(.*?)<\/a>/g
    ),
  ].map(([, href, inner]) => [text(inner), href]);

/** The meeting link's button, whatever its tone. */
const joinButton = (html: string) =>
  html.match(/<a class="mds-btn [^"]*mds-join__link"[^>]*>/)?.[0];

/** One region of the page by its test id, up to the end of its element. */
const region = (html: string, testId: string, tag = "section") =>
  html.match(
    new RegExp(`<${tag}[^>]*data-testid="${testId}"[^>]*>.*?</${tag}>`)
  )?.[0];
const card = (html: string) =>
  html.match(/<section[^>]*data-testid="session-action".*?<\/section>/)?.[0] ??
  "";

const course = {
  id: "c1",
  koskId: "k1",
  title: "Emsile ve Bina",
  timeZone: "Europe/Istanbul",
  weeks: [],
} as unknown as CourseDetailResponse;

const session = (over: Record<string, unknown> = {}) =>
  ({
    id: "s1",
    courseId: "c1",
    weekId: "w5",
    weekNumber: 5,
    weekTitle: "Mehmûz fiiller",
    title: "Mehmûz fiiller: kara’e ve emr-i hâzır",
    startsAt: at(8),
    durationMinutes: 60,
    status: "SCHEDULED",
    cancelledAt: null,
    replacementSessionId: null,
    replacement: null,
    meetingUrl: "https://zoom.us/j/123456789",
    inPerson: false,
    agenda: [
      { time: "21:00", title: "Selâm ve geçen haftanın tekrarı" },
      { time: "21:25", title: "قرأ fiilinin mâzî ve muzâri çekimi" },
    ],
    resources: [],
    previous: {
      id: "s0",
      title: "Hafta sonu müzakeresi",
      weekNumber: 4,
      startsAt: new Date("2026-09-27T17:00:00Z"),
      status: "ENDED",
    },
    next: {
      id: "s2",
      title: "Hafta sonu müzakeresi (telafi)",
      weekNumber: 5,
      startsAt: new Date("2026-10-07T18:00:00Z"),
      status: "SCHEDULED",
    },
    muderris: [{ name: "Abdülhamit Karaosmanoğlu", title: null, isImam: true }],
    contentLocked: false,
    ...over,
  }) as unknown as SessionResponse;

const render = async (
  s: SessionResponse,
  koskName: string | null = "Nûruosmaniye Köşkü",
  c: CourseDetailResponse = course
) => {
  const { SessionPage } = await import(
    "~/features/courses/components/session-page"
  );
  return renderToStaticMarkup(
    await SessionPage({ course: c, session: s, koskName, now: NOW })
  );
};

describe("session page, the header (MDRS-289)", () => {
  const listed = {
    ...course,
    weeks: [
      {
        id: "w5",
        weekNumber: 5,
        lessons: [
          { id: "s0b", type: "LIVE", title: "Önceki" },
          { id: "s1", type: "LIVE", title: "Bu" },
        ],
      },
    ],
  } as unknown as CourseDetailResponse;

  it("leads Köşk › Ders › Hafta N, the week the place the page is", async () => {
    const html = await render(session());
    const crumbs = html.match(/<nav class="mds-breadcrumb".*?<\/nav>/)?.[0];
    expect(crumbs).toContain('href="/kosks/k1"');
    expect(crumbs).toContain(">Nûruosmaniye Köşkü<");
    expect(crumbs).toContain('href="/courses/c1"');
    expect(crumbs).toContain('aria-current="page"><bdi>Hafta 5</bdi>');
    expect(crumbs).not.toContain("Mehmûz fiiller: kara’e");
  });

  it("drops the köşk from the breadcrumb when it cannot be read", async () => {
    const html = await render(session(), null);
    expect(html).not.toContain('href="/kosks/k1"');
    expect(html).toContain('href="/courses/c1"');
  });

  it("names the week and the celse's place in it over the title", async () => {
    const html = await render(session(), null, listed);
    expect(html).toContain(
      '<p class="mds-eyebrow col-start-1 row-start-1">Hafta 5 · 2. celse</p>'
    );
    expect(html).toMatch(
      /<h1 class="mds-h1[^"]*" dir="auto">Mehmûz fiiller: kara’e ve emr-i hâzır<\/h1>/
    );
    // the week alone when the course does not list the celse
    expect(await render(session())).toContain(
      '<p class="mds-eyebrow col-start-1 row-start-1">Hafta 5</p>'
    );
  });

  it("writes the day, the time, the length and the müderris on one line, with no müderris card", async () => {
    const meta = region(await render(session()), "session-meta", "div");
    expect(text(meta)).toContain(
      "3 Ekim Cumartesi · 21:00–22:00 İstanbul saatiyle"
    );
    expect(text(meta)).toContain("60 dk");
    expect(meta).toContain(">Abdülhamit Karaosmanoğlu<");
    expect(meta).toContain(`>${tr.imam}<`);
    expect(meta).toContain('class="mds-avatar mds-avatar--sm"');
    expect(meta).not.toContain("senin saatinle");
    expect(await render(session())).not.toContain(">Müderris<");
  });

  it("adds the viewer's own time when their clock shows another", async () => {
    viewer.zone = "Asia/Tokyo";
    const meta = text(region(await render(session()), "session-meta", "div"));
    expect(meta).toContain("3 Ekim Cumartesi · 21:00–22:00 İstanbul saatiyle");
    expect(meta).toContain("Paz 03:00 senin saatinle");
  });

  it("leaves out what the celse does not have", async () => {
    const html = await render(
      session({ startsAt: null, durationMinutes: null, muderris: [] })
    );
    expect(html).not.toContain('data-testid="session-meta"');
    expect(html).not.toContain('data-testid="session-state"');
  });

  it.each([
    ["counts down to a celse ahead", session(), "8 dakika sonra"],
    [
      "counts the days to one further away",
      session({ startsAt: at(3 * 24 * 60 + 8) }),
      "3 gün sonra",
    ],
    [
      "says how long a live one has run",
      session({ status: "LIVE", startsAt: at(-14) }),
      "Canlı · 14 dk",
    ],
    [
      "says one is over",
      session({ status: "ENDED", startsAt: at(-26 * 60) }),
      tr.endedLabel,
    ],
    [
      "says one was cancelled",
      session({ status: "CANCELLED", cancelledAt: at(-60) }),
      tr.cancelledLabel,
    ],
  ])("puts where the celse stands on the right: it %s", async (_l, s, badge) => {
    const state = region(await render(s), "session-state", "div");
    expect(text(state)).toBe(badge);
  });

  it("marks a live celse with the live badge", async () => {
    const state = region(
      await render(session({ status: "LIVE", startsAt: at(-14) })),
      "session-state",
      "div"
    );
    expect(state).toContain("mds-badge--live");
  });
});

describe("session page, the main card: nothing to watch yet (MDRS-283, MDRS-289)", () => {
  const said = (key: keyof typeof tr) =>
    (tr[key] as string).replaceAll("'", "&#x27;");
  const ahead = (over: Record<string, unknown>) =>
    session({
      meetingUrl: null,
      startsAt: at(2 * 24 * 60 + 4 * 60 + 8),
      ...over,
    });

  it("draws the date block on the course's clock and how long until the start", async () => {
    const html = card(await render(ahead({ inPerson: true })));
    expect(html).toContain('data-case="date"');
    const block = html.match(/<div[^>]*data-date-block="">.*?<\/div>/)?.[0];
    expect(block).toContain(">Salı<");
    expect(block).toContain(">6 Ekim<");
    expect(block).toContain(">01:00–02:00<");
    expect(block).toContain(">Başlamasına 2 gün 4 saat<");
  });

  it("says an in-person celse is held in person, with no meeting link and nothing to watch", async () => {
    const html = card(await render(ahead({ inPerson: true })));
    expect(html).toContain(tr.inPersonKind);
    expect(html).toContain(`>${said("inPersonText")}</h2>`);
    expect(html).toContain("Takvime ekle");
    expect(joinButton(html)).toBeUndefined();
    expect(html).not.toContain("/izle");
    expect(html).not.toContain(tr.noLinkText);
  });

  it("says a stream-only celse is streamed and opens here, not that its link is missing", async () => {
    const html = card(await render(ahead({ hasLiveStream: true })));
    expect(html).toContain(`>${said("streamText")}</h2>`);
    expect(html).not.toContain(tr.noLinkText);
    expect(html).not.toContain("/izle");
  });

  it("says an in-person celse with a stream is both", async () => {
    const html = card(
      await render(ahead({ inPerson: true, hasLiveStream: true }))
    );
    expect(html).toContain(`>${said("inPersonStreamText")}</h2>`);
    expect(html).not.toContain(said("inPersonText"));
  });

  it("still says the link is missing when the celse has none of the three", async () => {
    const html = card(await render(ahead({})));
    expect(html).toContain(`>${tr.noLinkText}</h2>`);
  });

  it("before the window, says when the meeting link opens and offers no button yet", async () => {
    const html = card(await render(session({ startsAt: at(45) })));
    expect(html).toContain(`>${tr.linkText}</h2>`);
    expect(html).toContain("Katılım, celse başlamadan 10 dakika önce açılır.");
    expect(joinButton(html)).toBeUndefined();
    expect(html).toContain(
      '<span class="mds-platform-chip mds-platform-chip--zoom"><span class="mds-platform-chip__dot" aria-hidden="true"></span>Zoom</span>'
    );
    expect(html).toContain("Takvime ekle");
  });

  it("opens the meeting link ten minutes before the start and not a minute earlier", async () => {
    expect(joinButton(card(await render(session({ startsAt: at(11) }))))).toBe(
      undefined
    );
    const ten = card(await render(session({ startsAt: at(10) })));
    expect(joinButton(ten)).toBe(
      '<a class="mds-btn mds-btn--primary mds-btn--large mds-join__link" href="https://zoom.us/j/123456789" target="_blank" rel="noopener noreferrer">'
    );
    expect(ten).toContain(`>${tr.joinMeeting}<`);
    expect(ten).toContain(tr.reveal);
    expect(ten).not.toContain("Katılım, celse başlamadan");
  });

  it("keeps the link the way in for a celse that has one, held in person and streamed too", async () => {
    const html = card(
      await render(
        session({ startsAt: at(5), inPerson: true, hasLiveStream: true })
      )
    );
    expect(joinButton(html)).toContain('href="https://zoom.us/j/123456789"');
    expect(html).toContain(`>${tr.linkText}</h2>`);
    expect(html).toContain(tr.inPersonKind);
    expect(html).not.toContain(said("inPersonStreamText"));
  });

  it("while a link-only celse runs, says for how long and keeps the link", async () => {
    const html = card(
      await render(session({ status: "LIVE", startsAt: at(-14) }))
    );
    expect(html).toContain('data-case="date"');
    expect(html).toContain(">14 dakikadır sürüyor<");
    expect(joinButton(html)).toContain("mds-btn--primary");
    // not on a live celse: the calendar is for one still ahead
    expect(html).not.toContain("Takvime ekle");
  });

  it("puts the viewer's zone under the date block when their clock shows another time", async () => {
    viewer.zone = "Asia/Tokyo";
    const html = card(await render(session()));
    const block = html.match(/<div[^>]*data-date-block="">.*?<\/div>/)?.[0];
    expect(block).toContain(">İstanbul saatiyle<");
  });
});

describe("session page, the main card: a stream (design tedris/16, MDRS-162, MDRS-285, MDRS-289)", () => {
  const live = (over: Record<string, unknown> = {}) =>
    session({
      status: "LIVE",
      startsAt: at(-14),
      liveStreamUrl: "https://www.youtube.com/watch?v=live123abc",
      ...over,
    });

  it("leads to the watch page with a poster and the primary button, framing nothing here", async () => {
    const html = card(await render(live()));
    expect(html).toContain('data-case="stream"');
    expect(html).not.toContain("<iframe");
    expect(html).not.toContain("live123abc");
    expect(watchButtons(html)).toEqual([
      ["Yayını izle", "/courses/c1/lessons/s1/izle"],
    ]);
    const poster = html.match(
      /<a [^>]*data-poster="stream"[^>]*>.*?<\/a>/
    )?.[0];
    expect(poster).toContain('href="/courses/c1/lessons/s1/izle"');
    expect(poster).toContain('tabindex="-1"');
    expect(poster).toContain('aria-hidden="true"');
    expect(poster).toContain(`>${tr.liveLabel}<`);
    expect(poster).toContain(">YouTube<");
    expect(html).toContain(`>${tr.streamTitle}</h2>`);
  });

  it("keeps the meeting link here, the secondary button beside the stream's, and says what each is for", async () => {
    const html = card(await render(live()));
    const join = joinButton(html);
    expect(join).toContain('href="https://zoom.us/j/123456789"');
    expect(join).toContain("mds-btn--outline");
    expect(html.indexOf("Yayını izle")).toBeLessThan(
      html.indexOf(tr.joinMeeting)
    );
    expect(text(html)).toContain(`14 dakikadır sürüyor· ${tr.watchOrJoin}`);
    expect(html).toContain(tr.recordingLater);
  });

  it("offers the watch page for a stream it could not frame too, without naming a host", async () => {
    const html = card(
      await render(live({ liveStreamUrl: "https://example.org/x" }))
    );
    expect(html).not.toContain("example.org");
    expect(html).not.toContain(">YouTube<");
    expect(watchButtons(html)).toEqual([
      ["Yayını izle", "/courses/c1/lessons/s1/izle"],
    ]);
  });

  it("offers no watch page when the API sent no stream (tedris/16 §3)", async () => {
    for (const s of [
      live({ liveStreamUrl: null }),
      live({ liveStreamUrl: undefined, contentLocked: true }),
    ]) {
      const html = await render(s);
      expect(html).not.toContain("/izle");
      expect(html).not.toContain("Yayını izle");
    }
    // the meeting link is the primary way in again
    expect(joinButton(await render(live({ liveStreamUrl: null })))).toContain(
      "mds-btn--primary"
    );
  });

  it("while a stream-only celse runs, sends questions to its live chat", async () => {
    const html = card(
      await render(live({ meetingUrl: null, hasLiveStream: true }))
    );
    expect(text(html)).toContain(tr.streamLiveText);
    expect(joinButton(html)).toBeUndefined();
    expect(html).not.toContain(tr.noLinkText);
  });

  it("while an in-person celse with a stream runs, says both", async () => {
    const html = card(
      await render(
        live({ meetingUrl: null, hasLiveStream: true, inPerson: true })
      )
    );
    expect(text(html)).toContain(tr.inPersonStreamLiveText);
  });

  it("still leads to the stream past the scheduled end while the API sends it, under another title", async () => {
    const html = await render(
      live({
        status: "ENDED",
        startsAt: at(-90),
        meetingUrl: null,
        recording: null,
      })
    );
    expect(text(region(html, "session-state", "div"))).toBe(tr.endedLabel);
    expect(watchButtons(card(html))).toEqual([
      ["Yayını izle", "/courses/c1/lessons/s1/izle"],
    ]);
    expect(card(html)).toContain(`>${tr.streamOpenTitle}</h2>`);
    expect(card(html)).not.toContain(tr.liveLabel);
  });

  it("offers nothing to watch on a cancelled celse", async () => {
    const html = await render(
      live({ status: "CANCELLED", cancelledAt: at(-200) })
    );
    expect(html).not.toContain("/izle");
  });
});

describe("session page, the main card: a recording (design tedris/17, MDRS-162, MDRS-285, MDRS-289)", () => {
  const recording = (over: Record<string, unknown> = {}) => ({
    id: "r1",
    title: "Mezîd fiiller ve bâblar: celse kaydı",
    provider: "YOUTUBE",
    url: "https://youtu.be/rec456abc",
    durationMinutes: 58,
    recordedAt: new Date("2026-09-26T18:00:00Z"),
    visibility: "ENROLLED",
    status: "READY",
    ...over,
  });
  const ended = (over: Record<string, unknown> = {}) =>
    session({
      status: "ENDED",
      startsAt: at(-26 * 60),
      meetingUrl: null,
      recording: recording(),
      ...over,
    });

  it("leads to the recording on the watch page: poster, its host, its length and its day", async () => {
    const html = card(await render(ended()));
    expect(html).toContain('data-case="recording"');
    expect(watchButtons(html)).toEqual([
      ["Kaydı izle", "/courses/c1/lessons/s1/izle"],
    ]);
    const poster = html.match(
      /<a [^>]*data-poster="recording"[^>]*>.*?<\/a>/
    )?.[0];
    expect(poster).toContain(">YouTube<");
    expect(poster).toContain(">58 dk<");
    expect(html).toContain(`>${tr.recordingKind}<`);
    expect(html).toContain(`>${tr.recordingTitle}</h2>`);
    expect(text(html)).toContain("26 Eylül 2026· 58 dk");
    expect(joinButton(html)).toBeUndefined();
    // the watch page's button takes the place of the tab's
    expect(html).not.toContain(tr.recordingsGo);
  });

  it("tells an enrolled talebe where their notes are, and no one else", async () => {
    const talebe = {
      ...course,
      contentLocked: false,
      enrollment: { status: "ENROLLED" },
    } as unknown as CourseDetailResponse;
    expect(card(await render(ended(), null, talebe))).toContain(
      tr.recordingNotes
    );
    expect(card(await render(ended()))).not.toContain(tr.recordingNotes);
  });

  it.each([
    ["YouTube", {}],
    [
      "Drive",
      {
        provider: "DRIVE",
        url: "https://drive.google.com/file/d/abcDEF123456/view?usp=sharing",
      },
    ],
    ["Bunny", { provider: "BUNNY", url: BUNNY }],
    ["another host", { provider: "OTHER", url: "https://example.org/kayit" }],
  ])("plays no %s recording here: no frame, no player, not its link", async (_label, over) => {
    const r = recording(over);
    const html = await render(ended({ recording: r }));
    expect(html).not.toContain("<iframe");
    expect(html).not.toContain(r.url.replaceAll("&", "&amp;"));
    expect(html).not.toContain("Mezîd fiiller ve bâblar: celse kaydı");
    expect(watchButtons(html)).toEqual([
      ["Kaydı izle", "/courses/c1/lessons/s1/izle"],
    ]);
  });

  it("names no host it has no name for", async () => {
    const poster = card(
      await render(
        ended({
          recording: recording({
            provider: "OTHER",
            url: "https://example.org/kayit",
            durationMinutes: null,
          }),
        })
      )
    ).match(/<a [^>]*data-poster="recording"[^>]*>.*?<\/a>/)?.[0];
    expect(poster).not.toContain("mds-platform-chip");
    expect(poster).not.toContain(" dk<");
  });

  it("offers the recording, not the stream, once it is READY while the clock still says live, the meeting link beside it", async () => {
    const html = card(
      await render(
        ended({
          status: "LIVE",
          startsAt: at(-14),
          meetingUrl: "https://zoom.us/j/123456789",
          liveStreamUrl: null,
        })
      )
    );
    expect(watchButtons(html)).toEqual([
      ["Kaydı izle", "/courses/c1/lessons/s1/izle"],
    ]);
    expect(joinButton(html)).toContain("mds-btn--outline");
    expect(html).not.toContain("yalnız izleyeceksen yayını aç");
  });

  it("says the recording is being prepared, and links the tab", async () => {
    const html = card(
      await render(
        ended({ recording: recording({ status: "PROCESSING", url: null }) })
      )
    );
    expect(html).toContain('data-case="date"');
    expect(html).not.toContain("/izle");
    expect(html).toContain(`>${tr.recordingPreparing}</h2>`);
    expect(html).toContain('href="/courses/c1?tab=kayitlar"');
    expect(html).toContain(tr.recordingsGo);
  });

  it("says there is no recording yet, and offers neither the watch page nor the tab", async () => {
    const html = card(await render(ended({ recording: null })));
    expect(html).not.toContain("/izle");
    expect(html).not.toContain(tr.recordingsGo);
    expect(html).toContain(`>${tr.noRecording}</h2>`);
    expect(html).toContain(`>${tr.endedLabel}<`);
  });

  it("says nothing of a recording to who may not read the content", async () => {
    const html = card(
      await render(ended({ recording: null, contentLocked: true }))
    );
    expect(html).not.toContain(tr.noRecording);
    expect(html).not.toContain(`>${tr.recordingKind}<`);
  });
});

describe("session page, a recording held back until its release time (MDRS-288)", () => {
  // 14 Ekim 2026 Çarşamba 20:00 in İstanbul, eleven days after NOW.
  const AT = new Date("2026-10-14T17:00:00Z");
  const LINE = "Ders kaydı 14 Ekim Çarşamba 20:00’de açılır.";
  const recording = (over: Record<string, unknown> = {}) => ({
    id: "r1",
    title: "Mehmûz fiiller: celse kaydı",
    provider: "YOUTUBE",
    url: null,
    durationMinutes: 58,
    recordedAt: new Date("2026-10-02T18:00:00Z"),
    visibility: "ENROLLED",
    status: "READY",
    availableAt: AT,
    ...over,
  });
  const ended = (over: Record<string, unknown> = {}) =>
    session({
      status: "ENDED",
      startsAt: at(-26 * 60),
      meetingUrl: null,
      liveStreamUrl: null,
      recording: recording(),
      ...over,
    });

  it("tells a talebe in the main card when the recording opens and offers nothing to play before it", async () => {
    const html = card(await render(ended()));
    expect(html).toContain(`>${LINE}</h2>`);
    expect(watchButtons(html)).toEqual([]);
    expect(html).not.toContain("/izle");
    // The tab lists it with the same line.
    expect(html).toContain('href="/courses/c1?tab=kayitlar"');
    expect(html).not.toContain(tr.noRecording);
  });

  it("adds the viewer's clock when it shows another time", async () => {
    viewer.zone = "Asia/Tokyo";
    const html = card(await render(ended()));
    expect(html).toContain(`>${LINE}</h2>`);
    expect(html).toContain("İstanbul saatiyle · Per 02:00 senin saatinle");
  });

  it("still leads a talebe to the stream tedrisat keeps sending, the line under it", async () => {
    const html = card(
      await render(
        ended({
          startsAt: at(-90),
          liveStreamUrl: "https://www.youtube.com/watch?v=live123abc",
          hasLiveStream: true,
        })
      )
    );
    expect(watchButtons(html)).toEqual([
      ["Yayını izle", "/courses/c1/lessons/s1/izle"],
    ]);
    expect(html).toContain(LINE);
    expect(html).toContain("data-recording-release");
    expect(html).not.toContain(tr.recordingLater);
  });

  it("lets the course team play it now, marked with the time talebe may", async () => {
    const html = card(
      await render(
        ended({ recording: recording({ url: "https://youtu.be/rec456abc" }) })
      )
    );
    expect(watchButtons(html)).toEqual([
      ["Kaydı izle", "/courses/c1/lessons/s1/izle"],
    ]);
    expect(html).toContain("Talebelere 14 Ekim Çarşamba 20:00’de açılacak");
    expect(html).not.toContain(LINE);
  });

  it("says nothing of a time that has come, or of none ('Hazır olunca hemen')", async () => {
    for (const availableAt of [at(-60), null]) {
      const html = await render(
        ended({
          recording: recording({
            url: "https://youtu.be/rec456abc",
            availableAt,
          }),
        })
      );
      expect(html).not.toContain("data-recording-release");
      expect(html).not.toContain("Talebelere");
      expect(watchButtons(html)).toEqual([
        ["Kaydı izle", "/courses/c1/lessons/s1/izle"],
      ]);
    }
  });
});

describe("session page, the main card: cancelled (design tedris/18, MDRS-289)", () => {
  const cancelled = (over: Record<string, unknown> = {}) =>
    session({
      title: "Hafta sonu müzakeresi",
      status: "CANCELLED",
      cancelledAt: NOW,
      meetingUrl: null,
      startsAt: new Date("2026-10-04T17:00:00Z"),
      durationMinutes: 45,
      replacementSessionId: "s2",
      replacement: {
        id: "s2",
        title: "Hafta sonu müzakeresi (telafi)",
        weekNumber: 5,
        startsAt: new Date("2026-10-07T18:00:00Z"),
        status: "SCHEDULED",
      },
      ...over,
    });

  it("says so in the card, with the replacement and its link", async () => {
    const html = card(await render(cancelled()));
    expect(html).toContain('data-case="cancelled"');
    expect(html).toContain(`>${tr.cancelledTitle}</h2>`);
    expect(html).toContain("Telafi celsesi:");
    expect(html).toContain("7 Ekim Çarşamba 21:00");
    expect(html).toContain('href="/courses/c1/lessons/s2"');
    expect(html).toContain(tr.replacementGo);
    expect(html).toContain(">İptal edildi<");
  });

  it("has no meeting link, no join button and no calendar menu", async () => {
    const html = await render(
      cancelled({ meetingUrl: "https://zoom.us/j/123456789" })
    );
    expect(card(html)).toContain(tr.cancelledJoinText);
    expect(joinButton(html)).toBeUndefined();
    expect(html).not.toContain("zoom.us");
    expect(html).not.toContain("Takvime ekle");
  });

  it("says what comes next when there is no replacement", async () => {
    const html = card(
      await render(cancelled({ replacementSessionId: null, replacement: null }))
    );
    expect(html).toContain(tr.cancelledTitle);
    expect(html).toContain(tr.noReplacement);
    expect(html).not.toContain("Telafi celsesi");
  });

  it("is not cancelled when it was not", async () => {
    expect(await render(session())).not.toContain(tr.cancelledTitle);
  });
});

describe("session page, a celse with no time (MDRS-285)", () => {
  it("has no date but still leads to what it has to watch", async () => {
    const html = await render(
      session({
        startsAt: null,
        status: "ENDED",
        meetingUrl: null,
        recording: {
          id: "r1",
          title: "Kayıt",
          provider: "YOUTUBE",
          url: "https://youtu.be/rec456abc",
          durationMinutes: 58,
          recordedAt: null,
          visibility: "ENROLLED",
          status: "READY",
        },
      })
    );
    expect(html).not.toContain("data-date-block");
    expect(watchButtons(html)).toEqual([
      ["Kaydı izle", "/courses/c1/lessons/s1/izle"],
    ]);
  });

  it("draws no card when there is nothing to watch either", async () => {
    const html = await render(session({ startsAt: null, meetingUrl: null }));
    expect(html).not.toContain('data-testid="session-action"');
  });
});

describe("session page, Gündem (MDRS-289)", () => {
  it("writes the agenda with its zone and sets Arabic runs apart", async () => {
    const html = await render(session());
    expect(html).toContain(`>${tr.agendaTitle}</h2>`);
    expect(html).toContain("Saatler İstanbul saatiyle.");
    expect(html).toContain(">21:25<");
    expect(html).toContain(
      '<span lang="ar" dir="rtl" class="mds-arabic">قرأ</span>'
    );
  });

  it("marks the step whose time has come while the celse is live", async () => {
    // Begun at 20:30 in İstanbul, 20:52 now: the 20:50 step is on.
    const html = await render(
      session({
        status: "LIVE",
        startsAt: at(-22),
        agenda: [
          { time: "20:30", title: "Selâm" },
          { time: "20:50", title: "Kara’e" },
          { time: "21:10", title: "Emr-i hâzır" },
        ],
      })
    );
    const items: string[] = html.match(/<li[^>]*>.*?<\/li>/g) ?? [];
    const steps = items.filter((li) => li.includes("mds-num min-inline-12"));
    expect(steps).toHaveLength(3);
    expect(steps.map((li) => li.includes('aria-current="step"'))).toEqual([
      false,
      true,
      false,
    ]);
    expect(steps[1]).toContain(`>${tr.agendaNow}<`);
    expect(steps[1]).toContain("bg-live-subtle");
  });

  it("marks no step before the start", async () => {
    const html = await render(session());
    expect(html).not.toContain('aria-current="step"');
    expect(html).not.toContain(`>${tr.agendaNow}<`);
  });

  it("draws no agenda card without steps", async () => {
    expect(await render(session({ agenda: [] }))).not.toContain(tr.agendaTitle);
  });
});

describe("session page, Kaynaklar (MDRS-279, MDRS-286, MDRS-289)", () => {
  const withCourseResources = {
    ...course,
    contentLocked: false,
    resources: [
      {
        id: "r1",
        name: "Bina",
        meta: "PDF · 124 sayfa",
        type: "pdf",
        url: "https://files.medaris.org/bina.pdf",
      },
    ],
  } as unknown as CourseDetailResponse;
  const own = [
    {
      id: "lr1",
      lessonId: "s1",
      name: "Mehmûz tablosu",
      meta: "Tek sayfa",
      url: "https://drive.google.com/file/d/1a2b3c/view",
      orderIndex: 0,
    },
    {
      id: "lr2",
      lessonId: "s1",
      name: "Kara’e çekimi",
      meta: null,
      url: "https://files.medaris.org/karae.pdf",
      orderIndex: 1,
    },
  ];
  const draw = (
    s: SessionResponse,
    c: CourseDetailResponse = withCourseResources
  ) => render(s, null, c);
  const resourcesCard = (html: string) =>
    region(html, "session-resources-card") ?? "";
  const list = (html: string, testId: string) =>
    html.match(
      new RegExp(`<ul[^>]*data-testid="${testId}"[^>]*>.*?</ul>`)
    )?.[0] ?? "";

  it("is one card: the kaynak on top, then this celse's links, then the course's", async () => {
    const html = resourcesCard(
      await draw(session({ resources: own, kaynak: "Bina · s. 4–9 · البناء" }))
    );
    expect(html).toContain(`>${tr.resourcesTitle}</h2>`);
    const kaynak = html.match(
      /<p[^>]*data-testid="session-kaynak"[^>]*>.*?<\/p>/
    )?.[0];
    expect(text(kaynak)).toBe("Okunacak yer: Bina · s. 4–9 · البناء");
    expect(kaynak).toContain(
      '<span lang="ar" dir="rtl" class="mds-arabic">البناء</span>'
    );
    const order = [
      'data-testid="session-kaynak"',
      `>${tr.resourcesOwn}</h3>`,
      `>${tr.resourcesCourse}</h3>`,
    ].map((needle) => html.indexOf(needle));
    expect(order.every((i) => i > -1)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it("lists this celse's links in order, each in a new tab, a Drive one marked", async () => {
    const mine = list(
      await draw(session({ resources: own })),
      "session-resources"
    );
    expect(mine.indexOf(">Mehmûz tablosu<")).toBeLessThan(
      mine.indexOf(">Kara’e çekimi<")
    );
    expect(mine).toContain(
      '<a class="mds-link" href="https://drive.google.com/file/d/1a2b3c/view" target="_blank" rel="noopener noreferrer">'
    );
    expect(mine).toContain("Tek sayfa");
    expect(mine.match(/<span class="mds-platform-chip[^"]*">[^<]*</g)).toEqual([
      '<span class="mds-platform-chip mds-platform-chip--google-drive self-start mbs-1">Google Drive<',
    ]);
    expect(mine).not.toContain("Bina");
    expect(
      list(await draw(session({ resources: own })), "course-resources")
    ).toContain(
      '<a class="mds-link" href="https://files.medaris.org/bina.pdf" target="_blank" rel="noopener noreferrer">'
    );
  });

  it("lists the names without links, and says once who opens them, to who may not read the content", async () => {
    const locked = own.map(({ url: _url, ...rest }) => rest);
    const html = await draw(
      session({ resources: locked, contentLocked: true }),
      {
        ...withCourseResources,
        contentLocked: true,
        resources: withCourseResources.resources.map(
          ({ url: _url, ...rest }) => rest
        ),
      } as unknown as CourseDetailResponse
    );
    const box = resourcesCard(html);
    expect(box).toContain(">Mehmûz tablosu<");
    expect(box).toContain(">Bina<");
    expect(box).not.toContain("<a ");
    expect(box).not.toContain("Google Drive");
    expect(box.split(tr.resourcesLocked)).toHaveLength(2);
    expect(html).not.toContain("drive.google.com");
  });

  it("shows a group only when it has rows", async () => {
    const courseOnly = resourcesCard(await draw(session()));
    expect(courseOnly).not.toContain(`>${tr.resourcesOwn}</h3>`);
    expect(courseOnly).toContain(`>${tr.resourcesCourse}</h3>`);
    expect(courseOnly).not.toContain('data-testid="session-kaynak"');
    const ownOnly = resourcesCard(
      await draw(session({ resources: own }), course)
    );
    expect(ownOnly).toContain(`>${tr.resourcesOwn}</h3>`);
    expect(ownOnly).not.toContain(`>${tr.resourcesCourse}</h3>`);
    const kaynakOnly = resourcesCard(
      await draw(session({ kaynak: "Bina · s. 4" }), course)
    );
    expect(kaynakOnly).toContain('data-testid="session-kaynak"');
    expect(kaynakOnly).not.toContain("<h3");
  });

  it("draws no card when there is neither a kaynak nor a link, a blank kaynak counted as none", async () => {
    for (const s of [session(), session({ kaynak: "  " })]) {
      expect(await draw(s, course)).not.toContain(
        'data-testid="session-resources-card"'
      );
    }
  });
});

describe("session page, Müfredat (MDRS-289)", () => {
  const lesson = (id: string, over: Record<string, unknown> = {}) => ({
    id,
    title: `Celse ${id}`,
    type: "LIVE",
    durationMinutes: 60,
    scheduledAt: at(7 * 24 * 60),
    cancelledAt: null,
    ...over,
  });
  const programme = {
    ...course,
    weeks: [
      {
        id: "w3",
        weekNumber: 3,
        lessons: [lesson("s9", { scheduledAt: at(-7 * 24 * 60) })],
      },
      {
        id: "w4",
        weekNumber: 4,
        lessons: [lesson("s0", { scheduledAt: at(-30) })],
      },
      {
        id: "w5",
        weekNumber: 5,
        lessons: [
          lesson("s1", { scheduledAt: at(8) }),
          lesson("s2", { cancelledAt: at(-60) }),
        ],
      },
    ],
  } as unknown as CourseDetailResponse;
  const aside = (html: string) =>
    html.match(/<aside[^>]*>.*<\/aside>/)?.[0] ?? "";
  const rows = (html: string) => aside(html).match(/<li[^>]*>.*?<\/li>/g) ?? [];

  it("lists the course's celses, this one highlighted and marked as the page, not a link", async () => {
    const html = await render(session(), null, programme);
    expect(aside(html)).toContain(`>${tr.curriculum}</h2>`);
    expect(text(aside(html))).toContain("3 hafta· 3 celse");
    const [s9, s0, s1, s2] = rows(html);
    expect(s1).toContain("bg-neutral-sunken");
    expect(s1).toContain('aria-current="page"');
    expect(s1).not.toContain("<a ");
    expect(text(s1)).toContain(`Hafta 5· 3 Ekim· ${tr.rowViewing}`);
    expect(s9).toContain('href="/courses/c1/lessons/s9"');
    expect(s9).not.toContain('aria-current="page"');
    expect(s9).not.toContain("bg-neutral-sunken");
    expect(s0).toContain('href="/courses/c1/lessons/s0"');
    expect(s2).toContain('href="/courses/c1/lessons/s2"');
  });

  it("says where each stands: done, live, cancelled, or its day", async () => {
    const [s9, s0, , s2] = rows(await render(session(), null, programme));
    expect(s9).toContain('data-state="ended"');
    expect(s9).toContain(
      `<span class="mds-visually-hidden">${tr.rowDone}</span>`
    );
    expect(text(s9)).not.toContain("26 Eylül");
    expect(s0).toContain('data-state="live"');
    expect(text(s0)).toContain(tr.liveLabel);
    expect(s2).toContain('data-state="cancelled"');
    expect(text(s2)).toContain(tr.rowCancelled);
  });

  it("says this celse has a recording when it can be watched, and no other row", async () => {
    const watched = session({
      status: "ENDED",
      startsAt: at(-26 * 60),
      meetingUrl: null,
      recording: {
        id: "r1",
        title: "Kayıt",
        provider: "YOUTUBE",
        url: "https://youtu.be/rec456abc",
        durationMinutes: 58,
        recordedAt: null,
        visibility: "ENROLLED",
        status: "READY",
      },
    });
    const html = await render(watched, null, programme);
    expect(aside(html).split(tr.rowRecording)).toHaveLength(2);
    expect(rows(html)[2]).toContain(tr.rowRecording);
    expect(aside(await render(session(), null, programme))).not.toContain(
      tr.rowRecording
    );
  });

  it("leads to the whole programme on the course page", async () => {
    expect(aside(await render(session(), null, programme))).toContain(
      `<a class="mds-btn mds-btn--link self-start" href="/courses/c1">${tr.allCurriculum}</a>`
    );
  });
});

describe("session page, previous and next (MDRS-289)", () => {
  const nav = (html: string) =>
    html.match(/<nav class="flex flex-wrap gap-4"[^>]*>.*?<\/nav>/)?.[0] ?? "";

  it("links the previous celse at the start and the next at the end", async () => {
    const html = nav(await render(session()));
    expect(html).toContain(`aria-label="${tr.neighbours}"`);
    expect(html.indexOf('data-neighbour="previous"')).toBeLessThan(
      html.indexOf('data-neighbour="next"')
    );
    expect(html).toContain(tr.previous);
    expect(html).toContain('href="/courses/c1/lessons/s0"');
    expect(html).toContain("27 Eyl Paz 20:00");
    expect(html).toContain(tr.next);
    expect(html).toContain('href="/courses/c1/lessons/s2"');
    expect(html).toContain("7 Eki Çar 21:00");
  });

  it("leaves a card out when there is no neighbour, the next one kept at the end", async () => {
    const html = nav(await render(session({ previous: null })));
    expect(html).not.toContain('data-neighbour="previous"');
    expect(html).toMatch(
      /class="mds-card [^"]* ms-auto" [^>]*data-neighbour="next"/
    );
    expect(nav(await render(session({ next: null })))).not.toContain(
      'data-neighbour="next"'
    );
  });

  it("draws no footer without either", async () => {
    expect(await render(session({ previous: null, next: null }))).not.toContain(
      tr.neighbours
    );
  });
});

describe("session page, the calendar", () => {
  it("is offered to someone who may read the content, for a celse still ahead", async () => {
    expect(await render(session())).toContain("Takvime ekle");
    expect(
      await render(session({ contentLocked: true, meetingUrl: undefined }))
    ).not.toContain("Takvime ekle");
  });
});

describe("session page strings", () => {
  it("has every key in every locale", () => {
    const keys = Object.keys(resources.tr.tedris.SessionPage).sort();
    for (const locale of ["en", "ar"] as const) {
      expect(Object.keys(resources[locale].tedris.SessionPage).sort()).toEqual(
        keys
      );
    }
  });
});
