import { resources } from "@medaris/i18n";
import type {
  CourseDetailResponse,
  SessionResponse,
} from "@medaris/services/tedrisat";
import { createElement, Fragment, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

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
vi.mock("next-intl/server", () => ({
  getTranslations: async () => translate,
  getLocale: async () => "tr",
  getTimeZone: async () => "Europe/Istanbul",
}));
// The calendar menu routes through next-intl's navigation, which needs a mounted app router.
vi.mock("~/lib/i18n/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));
// The live chat is a client component with its own spec; here only where it is mounted.
vi.mock("~/features/courses/components/live-chat", () => ({
  LiveChat: ({ streamUrl }: { streamUrl: string }) =>
    createElement("div", { "data-live-chat": streamUrl }),
}));
// The programme is an async server component with its own spec below.
vi.mock("~/features/courses/components/session-programme", () => ({
  SessionProgramme: () => null,
}));

const NOW = new Date("2026-10-03T17:52:00.000Z");
const at = (minutes: number) => new Date(NOW.getTime() + minutes * 60_000);

// A Bunny player link as tedrisat signs it for one viewer (MDRS-119).
const BUNNY =
  "https://player.mediadelivery.net/embed/424242/3f1c2b4a-5d6e-4f70-8a9b-0c1d2e3f4a5b?token=9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08&expires=1790000000";

/** The one frame of a page's markup. */
const iframeOf = (html: string) => {
  const frames = html.match(/<iframe[^>]*>/g) ?? [];
  expect(frames).toHaveLength(1);
  return frames[0];
};

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
    agenda: [
      { time: "21:00", title: "Selâm ve geçen haftanın tekrarı" },
      { time: "21:25", title: "قرأ fiilinin mâzî ve muzâri çekimi" },
    ],
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
  koskName: string | null = "Nûruosmaniye Köşkü"
) => {
  const { SessionPage } = await import(
    "~/features/courses/components/session-page"
  );
  return renderToStaticMarkup(
    await SessionPage({ course, session: s, koskName, now: NOW })
  );
};

describe("session page, upcoming (design tedris/15)", () => {
  it("shows the breadcrumb, the week, the title and the müderris with the imam badge", async () => {
    const html = await render(session());
    expect(html).toContain("Nûruosmaniye Köşkü");
    expect(html).toContain('href="/kosks/k1"');
    expect(html).toContain('href="/courses/c1"');
    expect(html).toContain("Hafta 5");
    expect(html).toContain("Mehmûz fiiller: kara’e ve emr-i hâzır");
    expect(html).toContain("Abdülhamit Karaosmanoğlu");
    expect(html).toContain(">İmam<");
  });

  it("counts down to the start, names the platform and the time, and joins inside the window", async () => {
    const html = await render(session());
    expect(html).toContain("8 dakika sonra");
    expect(html).toContain("3 Ekim Cumartesi 21:00");
    expect(html).toContain("60 dk");
    expect(html).toContain("Zoom");
    expect(html).toContain("Celseye katıl");
  });

  it("keeps the join closed, and says when it opens, before the window", async () => {
    const html = await render(session({ startsAt: at(45) }));
    expect(html).toContain("45 dakika sonra");
    expect(html).not.toContain("Celseye katıl");
    expect(html).toContain("Katılım, celse başlamadan 10 dakika önce açılır.");
  });

  it("opens the join link ten minutes before the start and not a minute earlier", async () => {
    const eleven = await render(session({ startsAt: at(11) }));
    expect(eleven).not.toContain("Celseye katıl");
    const ten = await render(session({ startsAt: at(10) }));
    expect(ten).toContain("Celseye katıl");
    expect(ten).toContain('href="https://zoom.us/j/123456789"');
    expect(ten).toContain('rel="noopener noreferrer"');
    expect(ten).toContain("Bağlantıyı göster");
  });

  it("says 3 days when the session is days away", async () => {
    const html = await render(session({ startsAt: at(3 * 24 * 60 + 8) }));
    expect(html).toContain("3 gün sonra");
  });

  it("has no join button and says so when the session has no link", async () => {
    const html = await render(session({ meetingUrl: null, startsAt: at(5) }));
    expect(html).not.toContain("Celseye katıl");
    expect(html).toContain("Toplantı bağlantısı henüz eklenmedi.");
  });

  it("writes the agenda with its zone and sets Arabic runs apart", async () => {
    const html = await render(session());
    expect(html).toContain("Celse akışı");
    expect(html).toContain("Saatler İstanbul saatiyle.");
    expect(html).toContain("21:25");
    expect(html).toContain(
      '<span lang="ar" dir="rtl" class="mds-arabic">قرأ</span>'
    );
  });

  it("links the previous and next sessions", async () => {
    const html = await render(session());
    expect(html).toContain("Önceki celse");
    expect(html).toContain('href="/courses/c1/lessons/s0"');
    expect(html).toContain("27 Eyl Paz 20:00");
    expect(html).toContain("Sonraki celse");
    expect(html).toContain('href="/courses/c1/lessons/s2"');
    expect(html).toContain("7 Eki Çar 21:00");
  });

  it("offers the calendar to someone who may read the content", async () => {
    expect(await render(session())).toContain("Takvime ekle");
  });

  it("leaves out the empty parts: no agenda card, no neighbours, no müderris card", async () => {
    const html = await render(
      session({ agenda: [], previous: null, next: null, muderris: [] })
    );
    expect(html).not.toContain("Celse akışı");
    expect(html).not.toContain("Önceki celse");
    expect(html).not.toContain(">Müderris<");
  });

  it("drops the köşk from the breadcrumb when it cannot be read", async () => {
    const html = await render(session(), null);
    expect(html).not.toContain('href="/kosks/k1"');
    expect(html).toContain('href="/courses/c1"');
  });

  it("is not an alert: no cancellation text", async () => {
    expect(await render(session())).not.toContain("Bu celse iptal edildi");
  });

  it("writes the session's own kaynak under its title, Arabic runs set apart (MDRS-279)", async () => {
    const html = await render(session({ kaynak: "Bina · s. 4–9 · البناء" }));
    const line = html.match(
      /<p[^>]*data-testid="session-kaynak"[^>]*>.*?<\/p>/
    )?.[0];
    expect(line).toContain(">Kaynak<");
    expect(line).toContain('dir="auto"');
    expect(line).toContain("Bina · s. 4–9 · ");
    expect(line).toContain(
      '<span lang="ar" dir="rtl" class="mds-arabic">البناء</span>'
    );
  });

  it("lists the course's resources in the aside, linked in a new tab (MDRS-279)", async () => {
    const { SessionPage } = await import(
      "~/features/courses/components/session-page"
    );
    const withLinks = {
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
    const html = renderToStaticMarkup(
      await SessionPage({
        course: withLinks,
        session: session(),
        koskName: null,
        now: NOW,
      })
    );
    expect(html).toContain(">Dersin kaynakları<");
    expect(html).toContain(
      '<a class="mds-link" href="https://files.medaris.org/bina.pdf" target="_blank" rel="noopener noreferrer">'
    );
    // none on a course without any (the fixture's)
    expect(await render(session())).not.toContain("Dersin kaynakları");
  });

  it("draws no kaynak line when the API sent none or a blank one", async () => {
    expect(await render(session())).not.toContain(
      'data-testid="session-kaynak"'
    );
    expect(await render(session({ kaynak: "  " }))).not.toContain(
      'data-testid="session-kaynak"'
    );
  });
});

describe("session page, cancelled (design tedris/18)", () => {
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

  it("shows the badge and the alert with the replacement and its link", async () => {
    const html = await render(cancelled());
    expect(html).toContain("İptal edildi");
    expect(html).toContain("Bu celse iptal edildi");
    expect(html).toContain("Telafi celsesi:");
    expect(html).toContain("7 Ekim Çarşamba 21:00");
    expect(html).toContain('href="/courses/c1/lessons/s2"');
    expect(html).toContain("Telafi celsesine git");
  });

  it("has no meeting link, no join button and no calendar menu", async () => {
    const html = await render(cancelled());
    expect(html).toContain("Bu celse için toplantı bağlantısı yok.");
    expect(html).not.toContain("Celseye katıl");
    expect(html).not.toContain("zoom.us");
    expect(html).not.toContain("Takvime ekle");
  });

  it("says only that it was cancelled when there is no replacement", async () => {
    const html = await render(
      cancelled({ replacementSessionId: null, replacement: null })
    );
    expect(html).toContain("Bu celse iptal edildi");
    expect(html).not.toContain("Telafi celsesi");
    expect(html).not.toContain("Telafi celsesine git");
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

describe("session page, live (design tedris/16, MDRS-162)", () => {
  const live = (over: Record<string, unknown> = {}) =>
    session({
      status: "LIVE",
      startsAt: at(-14),
      liveStreamUrl: "https://www.youtube.com/watch?v=live123abc",
      ...over,
    });

  it("says it is live and for how long it has been running", async () => {
    const html = await render(live());
    expect(html).toContain("Şu an canlı");
    expect(html).toContain("14 dakikadır sürüyor");
    expect(html).toContain("Celseye katıl");
  });

  it("frames the stream from the video id alone, and says what it is", async () => {
    const html = await render(live());
    expect(html).toContain(
      'src="https://www.youtube-nocookie.com/embed/live123abc"'
    );
    expect(html).toContain("Canlı yayın");
    expect(html).toContain("Yayını buradan izleyebilirsin.");
  });

  it("links a stream that cannot be framed instead of framing it", async () => {
    const html = await render(live({ liveStreamUrl: "https://example.org/x" }));
    expect(html).not.toContain("<iframe");
    expect(html).toContain("Canlı yayın burada oynar");
    expect(html).toContain('href="https://example.org/x"');
  });

  it("puts the live chat under a YouTube stream (MDRS-229)", async () => {
    const html = await render(live());
    expect(html).toContain(
      'data-live-chat="https://www.youtube.com/watch?v=live123abc"'
    );
    expect(html.indexOf("Yayını buradan izleyebilirsin.")).toBeLessThan(
      html.indexOf("data-live-chat")
    );
  });

  it("has no chat for a stream it cannot frame, nor without a stream", async () => {
    expect(
      await render(live({ liveStreamUrl: "https://example.org/x" }))
    ).not.toContain("data-live-chat");
    expect(await render(live({ liveStreamUrl: null }))).not.toContain(
      "data-live-chat"
    );
  });

  it("draws no player when the API sent no stream (tedris/16 §3)", async () => {
    const none = await render(live({ liveStreamUrl: null }));
    expect(none).not.toContain("Canlı yayın");
    expect(none).not.toContain("<iframe");
    const locked = await render(live({ liveStreamUrl: undefined }));
    expect(locked).not.toContain("<iframe");
  });
});

describe("session page, ended with a recording (design tedris/17, MDRS-162)", () => {
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

  it("shows the player with the recording's title and its date and length", async () => {
    const html = await render(ended());
    expect(html).toContain("Mezîd fiiller ve bâblar: celse kaydı");
    expect(html).toContain(
      'src="https://www.youtube-nocookie.com/embed/rec456abc"'
    );
    expect(html).toContain("Ders kaydı");
    expect(html).toContain("26 Eylül 2026 Cumartesi");
    expect(html).toContain("58 dk");
  });

  it("says the session is over and links the recordings tab", async () => {
    const html = await render(ended());
    expect(html).toContain("Sona erdi");
    expect(html).toContain("Ders kayıtlarına git");
    expect(html).toContain('href="/courses/c1?tab=kayitlar"');
    expect(html).not.toContain("Celseye katıl");
  });

  it("frames a Drive recording through its preview", async () => {
    const html = await render(
      ended({
        recording: recording({
          provider: "DRIVE",
          url: "https://drive.google.com/file/d/abcDEF123456/view?usp=sharing",
        }),
      })
    );
    expect(html).toContain(
      'src="https://drive.google.com/file/d/abcDEF123456/preview"'
    );
  });

  it("opens a recording that cannot be framed at its host", async () => {
    const html = await render(
      ended({
        recording: recording({
          provider: "OTHER",
          url: "https://example.org/kayit",
        }),
      })
    );
    expect(html).not.toContain("<iframe");
    expect(html).toContain("Ders kaydı burada oynar");
    expect(html).toContain('href="https://example.org/kayit"');
    expect(html).toContain("Ders kaydını aç");
  });

  it("keeps the YouTube frame as it was: its sandbox, its permissions, the recording's title", async () => {
    const frame = iframeOf(await render(ended()));
    expect(frame).toContain(
      'sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"'
    );
    expect(frame).toContain(
      'allow="encrypted-media; picture-in-picture; fullscreen"'
    );
    expect(frame).not.toContain("allowFullScreen");
    expect(frame).toContain('title="Mezîd fiiller ve bâblar: celse kaydı"');
  });

  it("plays a Bunny recording in Bunny's player, on the very link the API signed (MDRS-114)", async () => {
    const frame = iframeOf(
      await render(
        ended({ recording: recording({ provider: "BUNNY", url: BUNNY }) })
      )
    );
    expect(frame).toContain(`src="${BUNNY.replaceAll("&", "&amp;")}"`);
    expect(frame).toContain(
      'title="Ders kaydı oynatıcısı: Mezîd fiiller ve bâblar: celse kaydı"'
    );
    expect(frame).toContain(
      'allow="autoplay; encrypted-media; picture-in-picture; fullscreen"'
    );
    expect(frame).toContain('allowFullScreen=""');
    expect(frame).toContain('referrerPolicy="strict-origin-when-cross-origin"');
    expect(frame).toContain('loading="lazy"');
    expect(frame).toContain("aspect-video");
    expect(frame).not.toContain("sandbox");
  });

  it.each([
    ["Bunny's older iframe host", BUNNY.replace("player.", "iframe.")],
    ["an unsigned player link", BUNNY.slice(0, BUNNY.indexOf("?"))],
    ["an extra query key", `${BUNNY}&autoplay=true`],
  ])("opens a Bunny link it will not frame at its host: %s", async (_label, url) => {
    const html = await render(
      ended({ recording: recording({ provider: "BUNNY", url }) })
    );
    expect(html).not.toContain("<iframe");
    expect(html).toContain("Ders kaydı burada oynar");
    expect(html).toContain(`href="${url.replaceAll("&", "&amp;")}"`);
    expect(html).toContain("Ders kaydını aç");
  });

  it("draws no player while the recording is being prepared, but still links the tab", async () => {
    const html = await render(
      ended({ recording: recording({ status: "PROCESSING", url: null }) })
    );
    expect(html).not.toContain("<iframe");
    expect(html).not.toContain("Mezîd fiiller ve bâblar: celse kaydı");
    expect(html).toContain('href="/courses/c1?tab=kayitlar"');
  });

  it("draws neither player nor link when there is no recording", async () => {
    const html = await render(ended({ recording: null }));
    expect(html).not.toContain("<iframe");
    expect(html).not.toContain("Ders kayıtlarına git");
  });
});
