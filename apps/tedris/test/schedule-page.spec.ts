import { resources } from "@medaris/i18n";
import type { ScheduleSessionResponse } from "@medaris/services/tedrisat";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { scheduleWindow } from "~/features/schedule/schedule-model";

/**
 * Programım (MDRS-163, design tedris/21) rendered with the real catalogue:
 * next-intl's server API without a request, the "Takvime ekle" menu (a client
 * component with its own spec) stood in for by its label.
 */

const text = (key: string) =>
  key
    .split(".")
    .reduce<unknown>(
      (node, part) => (node as Record<string, unknown>)?.[part],
      resources.tr.tedris
    ) as string;
const lookup = (key: string, values: Record<string, unknown> = {}) =>
  Object.entries(values).reduce(
    (acc, [k, v]) => acc.replaceAll(`{${k}}`, String(v)),
    text(key)
  );
vi.mock("next-intl/server", () => ({
  getTranslations: async () => lookup,
  getLocale: async () => "tr",
  getTimeZone: async () => "Europe/Istanbul",
}));
vi.mock("~/features/courses/components/calendar-menu", () => ({
  CalendarMenu: (props: { labels: { button: string } }) =>
    createElement("span", { "data-menu": props.labels.button }),
}));

// 1 Oct 2026, 10:00 in Istanbul.
const NOW = new Date("2026-10-01T07:00:00Z");
const IST = "Europe/Istanbul";

const s = (over: Partial<ScheduleSessionResponse>): ScheduleSessionResponse =>
  ({
    id: "l1",
    courseId: "c1",
    courseTitle: "Emsile ve Bina",
    koskId: "k1",
    koskName: "Nûruosmaniye Köşkü",
    weekNumber: 5,
    title: "Mehmûz fiiller",
    startsAt: new Date("2026-10-03T18:00:00Z"),
    durationMinutes: 60,
    status: "SCHEDULED",
    meetingUrl: null,
    ...over,
  }) as ScheduleSessionResponse;

const render = async (
  sessions: ScheduleSessionResponse[] | null,
  from?: string
) => {
  const { SchedulePage } = await import(
    "~/features/schedule/components/schedule-page"
  );
  const element = await SchedulePage({
    sessions,
    window: scheduleWindow(from, NOW, IST),
    now: NOW,
  });
  return renderToStaticMarkup(element);
};

describe("Programım (design tedris/21)", () => {
  it("heads the page, names the zone and links the subscription", async () => {
    const html = await render([s({})]);
    expect(html).toContain(">Programım<");
    expect(html).toContain(
      "Kayıtlı olduğun derslerin önümüzdeki yedi gündeki celseleri."
    );
    expect(html).toContain("Saatler İstanbul saatiyle.");
    expect(html).toContain(">Saat dilimini değiştir<");
    expect(html).toMatch(
      /href="\/account\/calendar"[^>]*>[\s\S]*Takvim aboneliği/
    );
  });

  it("groups by day with the day, its distance from today, and each session's clock, length, course, week and title", async () => {
    const html = await render([
      s({ id: "a", title: "Birinci" }),
      s({
        id: "b",
        title: "İkinci",
        startsAt: new Date("2026-10-04T17:00:00Z"),
        durationMinutes: 45,
      }),
      s({
        id: "c",
        title: "Üçüncü",
        startsAt: new Date("2026-10-04T18:00:00Z"),
      }),
    ]);
    expect(html).toContain("3 Ekim Cumartesi");
    expect(html).toContain("Öbür gün");
    expect(html).toContain("4 Ekim Pazar");
    expect(html).toContain("3 gün sonra");
    expect(html.match(/<section/g)).toHaveLength(2);
    expect(html).toContain(">21:00<");
    expect(html).toContain(">60 dk<");
    expect(html).toContain(">45 dk<");
    expect(html).toContain("<bdi>Emsile ve Bina</bdi>");
    expect(html).toContain("Hafta 5");
    expect(html).toMatch(/href="\/courses\/c1\/lessons\/a"[^>]*>Birinci</);
  });

  it("shows the platform of a link, or says there is none", async () => {
    const html = await render([
      s({ id: "a", meetingUrl: "https://us02web.zoom.us/j/123" }),
      s({ id: "b", meetingUrl: null }),
    ]);
    expect(html).toContain("mds-platform-chip--zoom");
    expect(html).toContain("Toplantı bağlantısı henüz eklenmedi.");
  });

  it("lists a cancelled session with the dashed badge and its note, without a calendar menu or a link", async () => {
    const html = await render([
      s({ id: "a", status: "CANCELLED", meetingUrl: null }),
      s({ id: "b", startsAt: new Date("2026-10-03T19:00:00Z") }),
    ]);
    expect(html).toContain("mds-badge--outline");
    expect(html).toContain(">İptal edildi<");
    expect(html).toContain("Bu celse iptal edildi.");
    // The planned one has its badge and its menu; the cancelled one neither.
    expect(html.match(/>Planlandı</g)).toHaveLength(1);
    expect(html.match(/data-menu=/g)).toHaveLength(1);
    expect(html).toContain('data-menu="Takvime ekle: Mehmûz fiiller"');
  });

  it("marks a running session Şu an canlı with the way in, and a finished one Sona erdi (tedris/21)", async () => {
    const live = s({
      id: "a",
      startsAt: new Date("2026-10-01T06:30:00Z"),
      meetingUrl: "https://zoom.us/j/9",
    });
    const over = s({ id: "b", startsAt: new Date("2026-10-01T04:00:00Z") });
    const html = await render([over, live]);
    expect(html).toContain("mds-badge--live");
    expect(html).toContain("Şu an canlı");
    expect(html).toContain(">Sona erdi<");
    // A live row has no calendar menu; it has the join link instead.
    expect(html).not.toContain('data-menu="Takvime ekle');
    expect(html).toContain('href="https://zoom.us/j/9"');
    expect(html).toContain("Celseye katıl");
  });

  it("offers the next seven days, and the way back once it has moved on", async () => {
    const first = await render([s({})]);
    expect(first).toContain('href="/schedule?from=2026-10-08"');
    expect(first).not.toContain("Bugüne dön");
    const later = await render([s({})], "2026-10-08");
    expect(later).toContain('href="/schedule?from=2026-10-15"');
    expect(later).toContain(">Bugüne dön<");
  });

  it("says so when the week is empty, and shows an Alert, not an empty week, when the read failed", async () => {
    expect(await render([])).toContain("Bu yedi günde celsen yok.");
    const failed = await render(null);
    expect(failed).toContain("Programın yüklenemedi");
    expect(failed).toContain("mds-alert");
    expect(failed).not.toContain("Bu yedi günde celsen yok.");
  });
});
