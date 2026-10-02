import { resources } from "@medaris/i18n";
import type { NotificationResponse } from "@medaris/services/tedrisat";
import { createTranslator } from "next-intl";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// The client hooks the page uses, without a Next request: the real catalogue
// (ICU included), a fixed zone, a router nobody calls, no toast root and no
// server actions.
vi.mock("next-intl", async (importOriginal) => {
  const real = await importOriginal<typeof import("next-intl")>();
  return {
    ...real,
    useLocale: () => "tr",
    useTimeZone: () => "Europe/Istanbul",
    useTranslations: (namespace: string) => {
      const [root, ...rest] = namespace.split(".");
      return createTranslator({
        locale: "tr",
        messages: resources.tr.tedris,
        namespace: [root === "tedris" ? rest[0] : root, ...rest.slice(1)]
          .filter(Boolean)
          .join(".") as never,
      });
    },
  };
});
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh() {} }) }));
vi.mock("@medaris/ui/mds/toast", () => ({
  useToaster: () => ({ notify: () => "", dismiss: () => {} }),
}));
vi.mock("~/features/notifications/actions", () => ({
  loadNotifications: vi.fn(),
  loadNotificationCounts: vi.fn(),
  markNotificationRead: vi.fn(),
  markAllNotificationsRead: vi.fn(),
}));

const COURSE = "c0000000-0000-4000-8000-000000000001";
const NOW = "2026-10-02T07:00:00Z";

const row = (
  id: string,
  createdAt: string,
  over: Partial<NotificationResponse> = {}
): NotificationResponse => ({
  id,
  type: "SESSION_CANCELLED",
  targetType: "COURSE",
  targetId: COURSE,
  params: {
    courseTitle: "Emsile ve Bina",
    sessionAt: "2026-10-04T17:00:00Z",
    source: "Abdülhamit Karaosmanoğlu",
  },
  readAt: null,
  createdAt: new Date(createdAt),
  ...over,
});

const render = async (
  initial: Parameters<
    typeof import("~/features/notifications/components/notifications-page").NotificationsPage
  >[0]["initial"]
) => {
  const { NotificationsPage } = await import(
    "~/features/notifications/components/notifications-page"
  );
  return renderToStaticMarkup(
    createElement(NotificationsPage, { initial, now: NOW })
  );
};

describe("notifications page (tedris/36)", () => {
  it("shows the heading, the tab counts, the day groups and the Yeni badges", async () => {
    const html = await render({
      items: [
        row("1", "2026-10-02T05:40:00Z"),
        row("2", "2026-10-01T19:15:00Z"),
        row("3", "2026-09-28T09:00:00Z", {
          type: "ENROLLMENT_APPROVED",
          params: { courseTitle: "Siyer okumaları", source: "Beyazıt Köşkü" },
          readAt: new Date("2026-09-28T10:00:00Z"),
        }),
      ],
      nextCursor: null,
      counts: { unread: 2, total: 3 },
    });

    expect(html).toContain("<h1");
    expect(html).toContain("Bildirimler");
    expect(html).toContain("Başvurularından ve derslerinden gelen haberler.");
    expect(html).toContain("Tümünü okundu say");
    expect(html).toMatch(/Tümü<span class="mds-tab__count">3<\/span>/);
    expect(html).toMatch(/Okunmamış<span class="mds-tab__count">2<\/span>/);
    expect(html).toContain(">Bugün<");
    expect(html).toContain(">Dün<");
    expect(html).toContain(">Daha önce<");
    expect(html).toContain("Celse iptal edildi");
    expect(html).toContain(
      "Emsile ve Bina dersinin Paz 4 Ekim 20:00 celsesi iptal edildi."
    );
    expect((html.match(/>Yeni</g) ?? []).length).toBe(2);
    expect(html).toContain(`href="/courses/${COURSE}"`);
    // "Neler bildirilir" is there; the e-mail card part is not (SMTP).
    expect(html).toContain("Neler bildirilir");
    expect(html).not.toContain("E-posta tercihleri");
  });

  it("disables 'Tümünü okundu say' when nothing is unread", async () => {
    const html = await render({
      items: [row("1", "2026-10-02T05:40:00Z", { readAt: new Date(NOW) })],
      nextCursor: null,
      counts: { unread: 0, total: 1 },
    });
    expect(html).toMatch(/<button[^>]*disabled[^>]*>[\s\S]*?Tümünü okundu say/);
    expect(html).not.toContain(">Yeni<");
  });

  it("says there is nothing when the list is empty, and has no read-all button", async () => {
    const html = await render({
      items: [],
      nextCursor: null,
      counts: { unread: 0, total: 0 },
    });
    expect(html).toContain("Bildirim yok");
    expect(html).not.toContain("Tümünü okundu say");
  });

  it("offers a retry when the server could not read the list", async () => {
    const html = await render(null);
    expect(html).toContain("Bildirimler yüklenemedi");
    expect(html).toContain("Yeniden dene");
  });

  it("offers more when a next page exists", async () => {
    const html = await render({
      items: [row("1", "2026-10-02T05:40:00Z")],
      nextCursor: "abc",
      counts: { unread: 1, total: 30 },
    });
    expect(html).toContain("Daha fazla göster");
  });
});
