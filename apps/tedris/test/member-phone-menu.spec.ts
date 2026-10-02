import { resources } from "@medaris/i18n";
import type { ScheduleSessionResponse } from "@medaris/services/tedrisat";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

/**
 * The signed-in talebe's phone menu and the home block behind it (MDRS-163,
 * design tedris/44). The kit's bar is drawn open: its sheet is a Base UI
 * Dialog portal, which a static render leaves closed; the sheet's behaviour
 * (focus on the close button, Esc, closing at 768 px) is the kit's and has its
 * own spec.
 */

const text = (key: string) =>
  key
    .split(".")
    .reduce<unknown>(
      (node, part) => (node as Record<string, unknown>)?.[part],
      resources.tr.tedris
    ) as string;
const fill = (message: string, values: Record<string, unknown> = {}) =>
  Object.entries(values).reduce(
    (acc, [k, v]) => acc.replaceAll(`{${k}}`, String(v)),
    message
  );
const pathname = vi.hoisted(() => ({ current: "/home" }));
vi.mock("next-intl", () => ({
  useLocale: () => "tr",
  useTranslations:
    (namespace?: string) => (key: string, values?: Record<string, unknown>) =>
      fill(
        text(namespace ? `${namespace.replace(/^tedris\./, "")}.${key}` : key),
        values
      ),
}));
vi.mock("next-intl/server", () => ({
  getTranslations:
    async () => (key: string, values?: Record<string, unknown>) =>
      fill(text(key), values),
  getLocale: async () => "tr",
  getTimeZone: async () => "Europe/Istanbul",
}));
vi.mock("~/lib/i18n/navigation", () => ({
  usePathname: () => pathname.current,
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock("@medaris/ui/mds/app-bar", () => ({
  AppBar: (props: {
    title: ReactNode;
    actions: ReactNode;
    footer: ReactNode;
    children: ReactNode;
  }) =>
    createElement(
      "div",
      null,
      createElement("p", { "data-title": true }, props.title),
      createElement("div", { "data-actions": true }, props.actions),
      createElement("nav", null, props.children),
      createElement("div", { "data-foot": true }, props.footer)
    ),
}));
vi.mock("~/features/courses/components/calendar-menu", () => ({
  CalendarMenu: () => createElement("span", { "data-menu": true }),
}));

const render = async (path: string, name = "Zeynep Betül Karahanlı") => {
  pathname.current = path;
  const { MemberPhoneMenu } = await import(
    "~/components/phone-menu/member-phone-menu"
  );
  return renderToStaticMarkup(createElement(MemberPhoneMenu, { name }));
};
const nav = (html: string) => /<nav>(.*?)<\/nav>/.exec(html)?.[1] as string;

describe("the phone menu of a signed-in talebe (design tedris/44)", () => {
  it("holds the five pages in order, and no 'Çıkış yap'", async () => {
    const html = await render("/home");
    const labels = [...nav(html).matchAll(/<a [^>]*>(.*?)<\/a>/g)].map(
      (m) => m[1]
    );
    expect(labels).toEqual([
      "Ana sayfa",
      "Keşfet",
      "Derslerim",
      "Programım",
      "Desteler",
    ]);
    expect(html).not.toContain("Çıkış yap");
  });

  it("marks the page the talebe is on, and names the bar after it", async () => {
    const schedule = await render("/schedule");
    expect(nav(schedule)).toMatch(/href="\/tr\/schedule" aria-current="page"/);
    expect(nav(schedule)).not.toMatch(/href="\/tr\/home" aria-current/);
    expect(schedule).toMatch(/data-title="true">Programım</);
    // A köşk or a medrese page belongs to Keşfet.
    expect(nav(await render("/kosks/k1"))).toMatch(
      /href="\/tr\/discover" aria-current="page"/
    );
    expect(nav(await render("/madrasahs/m1"))).toMatch(
      /href="\/tr\/discover" aria-current="page"/
    );
    expect(nav(await render("/my-courses"))).toMatch(
      /href="\/tr\/my-courses" aria-current="page"/
    );
  });

  it("ends in the person, as the way to Hesap: avatar, name, Talebe", async () => {
    const html = await render("/home");
    const foot = /data-foot="true">(.*)$/.exec(html)?.[1] as string;
    expect(foot).toContain('href="/tr/account"');
    expect(foot).toContain("mds-nav-user");
    expect(foot).toContain("Zeynep Betül Karahanlı");
    expect(foot).toContain(">Talebe<");
    expect(foot).toContain(">ZK<");
  });

  it("has the bell as its action", async () => {
    expect(await render("/home")).toMatch(
      /href="\/tr\/notifications"[^>]*aria-label="Bildirimler"/
    );
  });
});

const session = (
  over: Partial<ScheduleSessionResponse>
): ScheduleSessionResponse =>
  ({
    id: "l1",
    courseId: "c1",
    courseTitle: "Emsile ve Bina",
    koskId: "k1",
    koskName: "Nûruosmaniye Köşkü",
    weekNumber: 5,
    title: "Mehmûz fiiller: kara’e ve emr-i hâzır",
    startsAt: new Date("2026-10-03T18:00:00Z"),
    durationMinutes: 60,
    status: "SCHEDULED",
    meetingUrl: null,
    ...over,
  }) as ScheduleSessionResponse;

describe("the signed-in Ana sayfa's sessions (design tedris/44)", () => {
  const NOW = new Date("2026-10-01T07:00:00Z");
  const render = async (sessions: ScheduleSessionResponse[] | null) => {
    const { HomeSessions } = await import(
      "~/features/schedule/components/home-sessions"
    );
    return renderToStaticMarkup(
      await HomeSessions({ name: "Zeynep Betül Karahanlı", sessions, now: NOW })
    );
  };

  it("greets by first name and says when the next session is", async () => {
    const html = await render([session({})]);
    expect(html).toContain("Selâmün aleyküm, Zeynep");
    expect(html).toContain("Sıradaki celsen öbür gün, Cumartesi 21:00’de.");
  });

  it("shows the nearest session as the card, and says when its link is not there yet", async () => {
    const html = await render([
      session({}),
      session({
        id: "l2",
        title: "Sonraki ders",
        startsAt: new Date("2026-10-06T18:00:00Z"),
      }),
    ]);
    expect(html).toContain("Sıradaki celse");
    expect(html).toContain("Toplantı bağlantısı henüz eklenmedi.");
    expect(html).toMatch(
      /href="\/courses\/c1\/lessons\/l1"[^>]*>Celse sayfası</
    );
    expect(html).toContain("data-menu");
    expect(html).toContain("Sonraki celseler");
    expect(html).toContain("Sonraki ders");
    expect(html).toMatch(/href="\/schedule"/);
  });

  it("shows the platform when the link is there", async () => {
    const html = await render([
      session({ meetingUrl: "https://meet.google.com/abc-defg-hij" }),
    ]);
    expect(html).toContain("mds-platform-chip--google-meet");
    expect(html).not.toContain("Toplantı bağlantısı henüz eklenmedi.");
  });

  it("changes the sentence when there is no session, and when the read failed", async () => {
    expect(await render([])).toContain("Planlı bir celsen görünmüyor.");
    expect(await render(null)).toContain("Celselerin şu an okunamadı.");
    expect(await render([])).not.toContain("Sıradaki celse<");
  });
});
