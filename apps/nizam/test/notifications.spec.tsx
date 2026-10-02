import { resources } from "@medaris/i18n";
import type { NotificationResponse } from "@medaris/services/tedrisat";
import { createTranslator } from "next-intl";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  appendPage,
  initialState,
  markAllRead,
  markRead,
  replaceList,
} from "~/features/notifications/notification-state";
import {
  bellLabel,
  dayGroupOf,
  describeNotification,
  formatRowTime,
  groupByDay,
  notificationHref,
  notificationIcon,
  typesOf,
} from "~/features/notifications/notification-view";

// The client hooks the page uses, without a Next request: the real catalogue
// (ICU included), a fixed zone, a router nobody calls, no toast root and no
// server actions.
vi.mock("next-intl", async (importOriginal) => {
  const real = await importOriginal<typeof import("next-intl")>();
  return {
    ...real,
    useLocale: () => "tr",
    useTimeZone: () => "Europe/Istanbul",
    useTranslations: (namespace: string) =>
      createTranslator({
        locale: "tr",
        messages: resources.tr.nizam,
        namespace: namespace.split(".").slice(1).join(".") as never,
      }),
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

const KOSK = "b0000000-0000-4000-8000-0000000000aa";
const IST = "Europe/Istanbul";
const NOW = "2026-10-02T12:00:00Z";

const row = (
  id: string,
  createdAt: string,
  over: Partial<NotificationResponse> = {}
): NotificationResponse => ({
  id,
  type: "COURSE_BAN_PLACED",
  targetType: "KOSK",
  targetId: KOSK,
  params: {
    source: "Nûruosmaniye Köşkü",
    koskName: "Nûruosmaniye Köşkü",
    courseTitle: "Avâmil ve Tasrîf",
    talebeName: "Ömer Faruk Demirkaya",
    actorName: "Ayşe Nur Kılıçarslan",
    reason: "Celselerde uyarılara rağmen kırıcı mesajlar yazdı.",
  },
  readAt: null,
  createdAt: new Date(createdAt),
  ...over,
});

const t = (key: string, values?: Record<string, string | number>) =>
  createTranslator({
    locale: "tr",
    messages: resources.tr.nizam,
    namespace: "NotificationsPage",
  })(key as never, values as never);

describe("the sentence of a notification (nizam/37, 46)", () => {
  it("words a course ban with who, whom, which course and the reason", () => {
    const text = describeNotification(row("1", NOW), { t });
    expect(text.title).toBe("Yeni ders yasağı");
    expect(text.body).toBe(
      "Ayşe Nur Kılıçarslan, Ömer Faruk Demirkaya adlı talebeyi Avâmil ve Tasrîf dersinden yasakladı. Gerekçe: Celselerde uyarılara rağmen kırıcı mesajlar yazdı."
    );
    expect(text.source).toBe("Nûruosmaniye Köşkü");
  });

  it("words a köşk ban and leaves the reason out when there is none", () => {
    const text = describeNotification(
      row("1", NOW, {
        type: "KOSK_BAN_PLACED",
        params: { actorName: "A", talebeName: "B", reason: "" },
      }),
      { t }
    );
    expect(text.title).toBe("Yeni köşk yasağı");
    expect(text.body).toBe(
      "A, B adlı talebeyi köşkün tüm derslerinden yasakladı."
    );
    expect(text.source).toBeNull();
  });

  it("reads a type this build does not know as a plain Bildirim, never as a key", () => {
    const text = describeNotification(
      row("1", NOW, { type: "FROM_THE_FUTURE" as never }),
      {
        t,
      }
    );
    expect(text).toEqual({
      title: "Bildirim",
      body: "",
      source: "Nûruosmaniye Köşkü",
    });
    expect(notificationIcon("FROM_THE_FUTURE")).toBe("bell");
    expect(notificationIcon("COURSE_BAN_PLACED")).toBe("ban");
  });

  it("does not fail on a missing value: an empty placeholder, not a thrown message", () => {
    const text = describeNotification(
      row("1", NOW, { params: { reason: "x" } }),
      { t }
    );
    expect(text.title).toBe("Yeni ders yasağı");
  });
});

describe("where a notification leads", () => {
  it("sends a ban to the köşk's Yasaklamalar", () => {
    expect(notificationHref(row("1", NOW))).toBe(`/kosks/${KOSK}/yasaklamalar`);
  });

  it("leads nowhere without a target or for an unknown type", () => {
    expect(notificationHref(row("1", NOW, { targetId: null }))).toBeNull();
    expect(notificationHref(row("1", NOW, { type: "X" as never }))).toBeNull();
    expect(
      notificationHref(row("1", NOW, { targetType: "COURSE" }))
    ).toBeNull();
  });
});

describe("the type chips", () => {
  it("asks for no type at Tümü and for the ban types at Yasaklar", () => {
    expect(typesOf("all")).toEqual([]);
    expect(typesOf("bans")).toEqual(["COURSE_BAN_PLACED", "KOSK_BAN_PLACED"]);
  });
});

describe("day groups (BUGÜN / DÜN / DAHA ÖNCE)", () => {
  it("groups by the viewer's calendar day, not by 24 hours", () => {
    // 21:30 UTC on the 1st is 00:30 on the 2nd in Istanbul: today.
    expect(dayGroupOf("2026-10-01T21:30:00Z", NOW, IST)).toBe("today");
    expect(dayGroupOf("2026-10-01T20:30:00Z", NOW, IST)).toBe("yesterday");
    expect(dayGroupOf("2026-09-29T10:00:00Z", NOW, IST)).toBe("earlier");
  });

  it("keeps the list's order inside a group and leaves empty groups out", () => {
    const groups = groupByDay(
      [
        row("a", "2026-10-02T09:00:00Z"),
        row("b", "2026-10-02T08:00:00Z"),
        row("c", "2026-09-28T08:00:00Z"),
      ],
      NOW,
      IST
    );
    expect(groups.map((g) => [g.key, g.items.map((n) => n.id)])).toEqual([
      ["today", ["a", "b"]],
      ["earlier", ["c"]],
    ]);
  });

  it("writes the clock for today and the date with the clock for older rows", () => {
    const at = new Date("2026-09-29T18:10:00Z");
    expect(formatRowTime(at, "today", "tr", IST)).toBe("21:10");
    expect(formatRowTime(at, "earlier", "tr", IST)).toBe("29 Eyl 21:10");
  });
});

describe("the bell's name (canvas rule 10)", () => {
  const names = {
    plain: "Bildirimler",
    unread: (n: number) => `Bildirimler, ${n} okunmamış`,
  };
  it("says the count, or only 'Bildirimler' for zero", () => {
    expect(bellLabel(3, names)).toBe("Bildirimler, 3 okunmamış");
    expect(bellLabel(0, names)).toBe("Bildirimler");
  });
});

describe("the list state", () => {
  const items = [
    row("1", "2026-10-02T09:00:00Z"),
    row("2", "2026-10-02T08:00:00Z", {
      readAt: new Date("2026-10-02T08:30:00Z"),
    }),
  ];
  const state = initialState(items, "cur", { unread: 1, total: 2 });
  const at = new Date("2026-10-02T10:00:00Z");

  it("marks one read once: the count falls by one however often it is called", () => {
    const once = markRead(state, "all", "1", at);
    expect(once.counts).toEqual({ unread: 0, total: 2 });
    expect(once.items[0]?.readAt).toEqual(at);
    expect(markRead(once, "all", "1", at)).toBe(once);
    expect(markRead(state, "all", "2", at)).toBe(state);
  });

  it("takes a read row off the Okunmamış list", () => {
    const once = markRead(state, "unread", "1", at);
    expect(once.items).toEqual([items[1]]);
  });

  it("marks everything read and empties the Okunmamış list", () => {
    expect(markAllRead(state, "all", at).items.every((n) => n.readAt)).toBe(
      true
    );
    expect(markAllRead(state, "all", at).counts.unread).toBe(0);
    const unread = markAllRead(state, "unread", at);
    expect(unread.items).toEqual([]);
    expect(unread.nextCursor).toBeNull();
  });

  it("swaps the list for another tab or chip and keeps the totals", () => {
    const next = replaceList(state, items.slice(0, 1), null);
    expect(next.items).toHaveLength(1);
    expect(next.counts).toEqual({ unread: 1, total: 2 });
  });

  it("appends a page without repeating a row it already holds", () => {
    const more = appendPage(
      state,
      [...items.slice(1), row("3", "2026-10-01T08:00:00Z")],
      null
    );
    expect(more.items.map((n) => n.id)).toEqual(["1", "2", "3"]);
    expect(more.nextCursor).toBeNull();
  });
});

const render = async (
  initial: Parameters<
    typeof import("~/features/notifications/components/notifications-page").NotificationsPage
  >[0]["initial"],
  scope: "kosk" | "platform" = "kosk"
) => {
  const { NotificationsPage } = await import(
    "~/features/notifications/components/notifications-page"
  );
  return renderToStaticMarkup(
    createElement(NotificationsPage, { initial, scope, now: NOW })
  );
};

describe("the page (nizam/37)", () => {
  it("draws the heading, the tab counts, the chips, the day groups and 'Yeni' on unread rows only", async () => {
    const html = await render({
      items: [
        row("1", "2026-10-02T09:00:00Z"),
        row("2", "2026-10-01T19:15:00Z", {
          readAt: new Date("2026-10-01T20:00:00Z"),
        }),
        row("3", "2026-09-29T09:00:00Z"),
      ],
      nextCursor: null,
      counts: { unread: 2, total: 3 },
    });
    expect(html).toContain("<h1");
    expect(html).toContain("Bildirimler");
    expect(html).toContain("Köşkünüzde konan yasaklar.");
    expect(html).toMatch(/Tümü<span[^>]*>3</);
    expect(html).toMatch(/Okunmamış<span[^>]*>2</);
    for (const chip of ["Tümü", "Yasaklar"]) expect(html).toContain(chip);
    for (const group of ["Bugün", "Dün", "Daha önce"]) {
      expect(html).toContain(group);
    }
    expect((html.match(/data-testid="notification-row"/g) ?? []).length).toBe(
      3
    );
    expect((html.match(/>Yeni</g) ?? []).length).toBe(2);
    expect((html.match(/>Okundu say</g) ?? []).length).toBe(2);
    expect(html).toContain("Tümünü okundu say");
    expect(html).toContain(`href="/tr/kosks/${KOSK}/yasaklamalar"`);
  });

  it("words the description for Medaris administration differently", async () => {
    const html = await render(
      { items: [], nextCursor: null, counts: { unread: 0, total: 0 } },
      "platform"
    );
    expect(html).toContain("Köşklerde konan yasaklar.");
  });

  it("offers no 'Tümünü okundu say' when there is nothing, and says Bildirim yok", async () => {
    const html = await render({
      items: [],
      nextCursor: null,
      counts: { unread: 0, total: 0 },
    });
    expect(html).not.toContain("Tümünü okundu say");
    expect(html).toContain("Bildirim yok");
  });

  it("disables 'Tümünü okundu say' at zero unread", async () => {
    const html = await render({
      items: [row("1", "2026-10-02T09:00:00Z", { readAt: new Date(NOW) })],
      nextCursor: null,
      counts: { unread: 0, total: 1 },
    });
    expect(html).toMatch(
      /<button[^>]*(disabled|aria-disabled="true")[^>]*>[\s\S]*?Tümünü okundu say/
    );
  });

  it("shows the retry state when the server could not read them", async () => {
    const html = await render(null);
    expect(html).toContain("Bildirimler yüklenemedi");
    expect(html).toContain("Yeniden dene");
  });

  it("offers 'Daha fazla göster' while a next page exists", async () => {
    const html = await render({
      items: [row("1", "2026-10-02T09:00:00Z")],
      nextCursor: "abc",
      counts: { unread: 1, total: 5 },
    });
    expect(html).toContain("Daha fazla göster");
  });
});

describe("messages", () => {
  for (const locale of ["tr", "en", "ar"] as const) {
    it(`${locale} words every notification type and filter`, () => {
      const page = resources[locale].nizam.NotificationsPage as unknown as {
        types: Record<string, Record<string, string>>;
        filters: Record<string, string>;
        subtitleKosk: string;
      };
      for (const type of ["COURSE_BAN_PLACED", "KOSK_BAN_PLACED"]) {
        for (const key of ["title", "body", "bodyReason"]) {
          expect(page.types[type]?.[key], `${type}.${key}`).toBeTruthy();
        }
      }
      expect(page.filters.all).toBeTruthy();
      expect(page.filters.bans).toBeTruthy();
      expect(
        (resources[locale].nizam.Shell as unknown as { bellUnread: string })
          .bellUnread
      ).toContain("{count}");
    });
  }
});
