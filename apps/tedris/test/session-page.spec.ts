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
// The Müfredat combobox goes to a celse through Next's router.
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  useRouter: () => ({ push: vi.fn() }),
}));
// The Müfredat list is drawn only once the combobox opens, in the browser
// (session-curriculum.spec.ts). Here the closed button is the real one, and
// what the page hands the list is written out beside it.
vi.mock(
  "~/features/courses/components/session-curriculum",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("~/features/courses/components/session-curriculum")
      >();
    return {
      ...actual,
      SessionCurriculum: (
        props: Parameters<typeof actual.SessionCurriculum>[0]
      ) =>
        createElement(
          Fragment,
          null,
          createElement(actual.SessionCurriculum, props),
          createElement(
            "ol",
            {
              hidden: true,
              "data-course-href": props.courseHref,
              "data-count": props.labels.count,
            },
            props.options.map((option) =>
              createElement(
                "li",
                {
                  key: option.id,
                  "data-id": option.id,
                  "data-current": String(option.current),
                  "data-href": option.href,
                },
                [
                  option.week,
                  option.title,
                  option.meta.join(" · "),
                  option.state,
                ].join(" | ")
              )
            )
          )
        ),
    };
  }
);

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
const text = (html: string | undefined) => {
  // Repeated until nothing changes, so a tag split by a removed one cannot
  // survive (CodeQL js/incomplete-multi-character-sanitization).
  let out = html ?? "";
  let before: string;
  do {
    before = out;
    out = out.replace(/<[^>]*>/g, "");
  } while (out !== before);
  return out.replaceAll("&#x27;", "'");
};

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
    expect(crumbs).toContain('href="/tr/kosks/k1"');
    expect(crumbs).toContain(">Nûruosmaniye Köşkü<");
    expect(crumbs).toContain('href="/tr/courses/c1"');
    expect(crumbs).toContain('aria-current="page"><bdi>Hafta 5</bdi>');
    expect(crumbs).not.toContain("Mehmûz fiiller: kara’e");
  });

  it("drops the köşk from the breadcrumb when it cannot be read", async () => {
    const html = await render(session(), null);
    expect(html).not.toContain('href="/tr/kosks/k1"');
    expect(html).toContain('href="/tr/courses/c1"');
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
      ["Yayını izle", "/tr/courses/c1/lessons/s1/izle"],
    ]);
    const poster = html.match(
      /<a [^>]*data-poster="stream"[^>]*>.*?<\/a>/
    )?.[0];
    expect(poster).toContain('href="/tr/courses/c1/lessons/s1/izle"');
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
      ["Yayını izle", "/tr/courses/c1/lessons/s1/izle"],
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
      ["Yayını izle", "/tr/courses/c1/lessons/s1/izle"],
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
      ["Kaydı izle", "/tr/courses/c1/lessons/s1/izle"],
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
      ["Kaydı izle", "/tr/courses/c1/lessons/s1/izle"],
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
      ["Kaydı izle", "/tr/courses/c1/lessons/s1/izle"],
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
    expect(html).toContain('href="/tr/courses/c1?tab=kayitlar"');
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
    expect(html).toContain('href="/tr/courses/c1?tab=kayitlar"');
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
      ["Yayını izle", "/tr/courses/c1/lessons/s1/izle"],
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
      ["Kaydı izle", "/tr/courses/c1/lessons/s1/izle"],
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
        ["Kaydı izle", "/tr/courses/c1/lessons/s1/izle"],
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
    expect(html).toContain('href="/tr/courses/c1/lessons/s2"');
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
      ["Kaydı izle", "/tr/courses/c1/lessons/s1/izle"],
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

describe("session page, one column (MDRS-289)", () => {
  const withResources = {
    ...course,
    contentLocked: false,
    resources: [
      { id: "r1", name: "Bina", type: "pdf", url: "https://x.org/bina.pdf" },
    ],
  } as unknown as CourseDetailResponse;
  const detailsClass = (html: string) =>
    html.match(/<div class="([^"]*)" data-testid="session-details">/)?.[1];
  /** "Gündem" and "Kaynaklar", up to the bottom row. */
  const details = (html: string) => {
    const from = html.indexOf('data-testid="session-details"');
    const to = html.indexOf('data-testid="session-pager"');
    return from < 0 ? "" : html.slice(from, to < 0 ? undefined : to);
  };

  it("puts the details above the bottom row, the row last, and has no aside", async () => {
    const html = await render(
      session({ kaynak: "Bina · s. 4" }),
      null,
      withResources
    );
    const order = [
      'data-testid="session-action"',
      'id="agenda-title"',
      'data-testid="session-resources-card"',
      'data-testid="session-pager"',
    ].map((needle) => html.indexOf(needle));
    expect(order.every((i) => i > -1)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(html).toMatch(/<\/nav><\/main>$/);
    expect(html).not.toContain("<aside");
    expect(html).not.toContain("grid-cols-[minmax(0,1fr)_var(--layout-aside)]");
  });

  it("sets Gündem and Kaynaklar side by side in two equal columns, stacked on a phone", async () => {
    const html = await render(session(), null, withResources);
    expect(detailsClass(html)).toBe(
      "grid gap-grid grid-cols-2 max-md:grid-cols-1"
    );
    const both = details(html);
    expect(both.indexOf('id="agenda-title"')).toBeGreaterThan(-1);
    expect(both.indexOf('id="agenda-title"')).toBeLessThan(
      both.indexOf('data-testid="session-resources-card"')
    );
  });

  it("gives either alone the whole width, and draws no row without both", async () => {
    const agendaOnly = await render(session());
    expect(detailsClass(agendaOnly)).toBe("grid gap-grid");
    expect(details(agendaOnly)).toContain('id="agenda-title"');
    expect(details(agendaOnly)).not.toContain("session-resources-card");
    const resourcesOnly = await render(
      session({ agenda: [] }),
      null,
      withResources
    );
    expect(detailsClass(resourcesOnly)).toBe("grid gap-grid");
    expect(details(resourcesOnly)).toContain(
      'data-testid="session-resources-card"'
    );
    expect(details(resourcesOnly)).not.toContain('id="agenda-title"');
    expect(await render(session({ agenda: [] }))).not.toContain(
      'data-testid="session-details"'
    );
  });
});

describe("session page, the bottom row (MDRS-289)", () => {
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
      {
        id: "w10",
        weekNumber: 10,
        lessons: [lesson("s10", { scheduledAt: at(5 * 7 * 24 * 60) })],
      },
    ],
  } as unknown as CourseDetailResponse;
  const pager = (html: string) => region(html, "session-pager", "nav") ?? "";
  const MARKERS = [
    'data-neighbour="previous"',
    'data-testid="session-curriculum"',
    'data-neighbour="next"',
  ];
  /** The row's parts in reading order. */
  const parts = (html: string) =>
    MARKERS.map((marker) => [marker, pager(html).indexOf(marker)] as const)
      .filter(([, i]) => i > -1)
      .sort(([, a], [, b]) => a - b)
      .map(([marker]) => marker.match(/"(.*)"/)?.[1]);
  /** One part of the row, from its opening tag to the next part's. */
  const piece = (html: string, marker: string) => {
    const nav = pager(html);
    const at = nav.indexOf(marker);
    if (at < 0) return "";
    const ends = MARKERS.map((m) => nav.indexOf(m))
      .filter((i) => i > at)
      .map((i) => nav.lastIndexOf("<div", i));
    return nav.slice(
      nav.lastIndexOf("<div", at),
      ends.length > 0 ? Math.min(...ends) : undefined
    );
  };
  const card = (html: string, direction: "previous" | "next") =>
    piece(html, `data-neighbour="${direction}"`);

  it("is previous, Müfredat, next, named as the way between celses", async () => {
    const html = await render(session(), null, programme);
    expect(parts(html)).toEqual(["previous", "session-curriculum", "next"]);
    expect(pager(html)).toContain(`aria-label="${tr.neighbours}"`);
  });

  it("leaves no hole for a missing neighbour: the Müfredat takes its room", async () => {
    expect(
      parts(await render(session({ previous: null }), null, programme))
    ).toEqual(["session-curriculum", "next"]);
    expect(
      parts(await render(session({ next: null }), null, programme))
    ).toEqual(["previous", "session-curriculum"]);
    expect(
      parts(
        await render(session({ previous: null, next: null }), null, programme)
      )
    ).toEqual(["session-curriculum"]);
    // the Müfredat grows into the row; a neighbour beside it keeps its width
    const html = await render(session({ previous: null }), null, programme);
    expect(piece(html, MARKERS[1])).toMatch(
      /^<div class="relative flex min-inline-0 flex-\[1_1_var\(--layout-aside\)\] max-md:order-first max-md:basis-full"/
    );
    expect(card(html, "next")).toContain(
      "flex-[1_1_0] items-center gap-3 px-4 py-0 md:flex-[0_1_var(--layout-sidebar)]"
    );
  });

  it("puts the Müfredat alone on a phone's first row, the two neighbours sharing the next", async () => {
    const html = await render(session(), null, programme);
    expect(pager(html)).toMatch(/^<nav class="flex gap-4 max-md:flex-wrap"/);
    expect(piece(html, MARKERS[1])).toContain(
      "max-md:order-first max-md:basis-full"
    );
    expect(card(html, "previous")).toContain("flex-[1_1_0]");
    expect(card(html, "next")).toContain("flex-[1_1_0]");
  });

  it("gives the three the same height and the same three lines", async () => {
    const html = await render(session(), null, programme);
    expect(card(html, "previous")).toContain("min-block-20");
    expect(card(html, "next")).toContain("min-block-20");
    expect(pager(html)).toMatch(/<button[^>]*class="[^"]*min-block-20/);
    for (const direction of ["previous", "next"] as const) {
      expect(
        card(html, direction).match(/<p class="[^"]*truncate/g)
      ).toHaveLength(3);
    }
  });

  it("words a neighbour: its week over it, the title as its one link, its day under it", async () => {
    const html = await render(session(), null, programme);
    const previous = card(html, "previous");
    expect(previous).toContain(">Önceki · Hafta 4</p>");
    expect(previous.match(/<a /g)).toHaveLength(1);
    expect(previous).toContain(
      '<a class="mds-card__link" href="/tr/courses/c1/lessons/s0"><span class="mds-visually-hidden">Önceki celse: Hafta 4, </span>Hafta sonu müzakeresi</a>'
    );
    expect(text(previous)).toContain("27 Eyl Paz 20:00");
    const next = card(html, "next");
    expect(next).toContain(">Sonraki · Hafta 5</p>");
    expect(next).toContain('href="/tr/courses/c1/lessons/s2"');
    expect(text(next)).toContain("7 Eki Çar 21:00");
    expect(next).toContain("text-end");
  });

  it("says when a neighbour is on air or was cancelled", async () => {
    const html = await render(
      session({
        previous: {
          id: "s0",
          title: "Önceki",
          weekNumber: 4,
          startsAt: at(-20),
          status: "LIVE",
        },
        next: {
          id: "s2",
          title: "Sonraki",
          weekNumber: 5,
          startsAt: at(60),
          status: "CANCELLED",
        },
      }),
      null,
      programme
    );
    expect(text(card(html, "previous"))).toContain(`· ${tr.liveLabel}`);
    expect(text(card(html, "next"))).toContain(`· ${tr.rowCancelled}`);
  });

  it("lets the neighbours share the row when the course lists no celse, and draws nothing with neither", async () => {
    const html = await render(session());
    expect(parts(html)).toEqual(["previous", "next"]);
    expect(card(html, "previous")).not.toContain("md:flex-[0_1");
    expect(await render(session({ previous: null, next: null }))).not.toContain(
      'data-testid="session-pager"'
    );
  });

  describe("the Müfredat combobox", () => {
    const trigger = (html: string) =>
      pager(html).match(/<button.*?<\/button>/)?.[0] ?? "";
    /** What the page hands the combobox, written out by the mock above. */
    const handed = (html: string) =>
      [...html.matchAll(/<li data-id="([^"]*)"[^>]*>(.*?)<\/li>/g)].map(
        ([li, id, words]) => ({
          id,
          words: text(words),
          current: li.includes('data-current="true"'),
          href: li.match(/data-href="([^"]*)"/)?.[1],
        })
      );

    it("is a closed button: the eyebrow, this celse's title, a thin bar with Hafta N / M, the chevron apart", async () => {
      const button = trigger(await render(session(), null, programme));
      expect(button).toContain('aria-haspopup="listbox"');
      expect(button).toContain('aria-expanded="false"');
      expect(button).not.toContain("aria-controls");
      expect(button).toContain(
        'aria-label="Müfredat: Hafta 5 / 10, Mehmûz fiiller: kara’e ve emr-i hâzır"'
      );
      expect(button).toContain(
        `<span class="mds-eyebrow truncate">${tr.curriculum}</span>`
      );
      expect(text(button)).toContain(
        `Mehmûz fiiller: kara’e ve emr-i hâzır·${tr.rowViewing}`
      );
      expect(button).toContain('style="--mds-progress:50%"');
      expect(text(button)).toContain("Hafta 5 / 10");
      expect(button).toContain(
        '<span class="flex inline-12 flex-none items-center justify-center border-s border-neutral-subtle"><svg'
      );
    });

    it("hands it every celse of the course in programme order, this one current, each to its page", async () => {
      const rows = handed(await render(session(), null, programme));
      expect(rows.map((row) => row.id)).toEqual([
        "s9",
        "s0",
        "s1",
        "s2",
        "s10",
      ]);
      expect(rows.filter((row) => row.current).map((row) => row.id)).toEqual([
        "s1",
      ]);
      expect(rows[0].href).toBe("/tr/courses/c1/lessons/s9");
      expect(rows.map((row) => row.words)).toEqual([
        "Hafta 3 | Celse s9 | 26 Eyl | ended",
        `Hafta 4 | Celse s0 | 3 Eki · ${tr.liveLabel} | live`,
        `Hafta 5 | Celse s1 | 3 Eki · ${tr.rowViewing} | upcoming`,
        `Hafta 5 | Celse s2 | 10 Eki · ${tr.rowCancelled} | cancelled`,
        "Hafta 10 | Celse s10 | 7 Kas | upcoming",
      ]);
    });

    it("says Kayıt var on this celse alone, when its recording can be watched", async () => {
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
      expect(
        handed(await render(watched, null, programme))
          .filter((row) => row.words.includes(tr.rowRecording))
          .map((row) => row.id)
      ).toEqual(["s1"]);
      expect(
        handed(await render(session(), null, programme)).some((row) =>
          row.words.includes(tr.rowRecording)
        )
      ).toBe(false);
    });

    it("leads to the course page's programme and counts the celses", async () => {
      const html = pager(await render(session(), null, programme));
      expect(html).toContain('data-course-href="/tr/courses/c1?tab=mufredat"');
      expect(html).toContain('data-count="5 celse"');
    });
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
