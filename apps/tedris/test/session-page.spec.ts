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
// The programme is an async server component with its own spec below.
vi.mock("~/features/courses/components/session-programme", () => ({
  SessionProgramme: () => null,
}));

const NOW = new Date("2026-10-03T17:52:00.000Z");
const at = (minutes: number) => new Date(NOW.getTime() + minutes * 60_000);

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
