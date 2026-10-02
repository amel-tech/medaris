import { resources } from "@medaris/i18n";
import type { NotificationResponse } from "@medaris/services/tedrisat";
import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";
import {
  bellLabel,
  dayGroupOf,
  describeNotification,
  formatRowTime,
  formatSessionTime,
  groupByDay,
  notificationHref,
  notificationIcon,
} from "~/features/notifications/notification-view";

const ZONE = "Europe/Istanbul";
const COURSE = "c0000000-0000-4000-8000-000000000001";
const SESSION = "c0000000-0000-4000-8000-000000000002";

const translator = (locale: "tr" | "en" | "ar") => {
  const t = createTranslator({
    locale,
    messages: resources[locale].tedris,
    namespace: "NotificationsPage",
  });
  return (key: string, values?: Record<string, string | number>) =>
    t(key as never, values as never);
};

/**
 * The generated client types `type` and `targetType` as the server's current
 * enums; a newer server (or these specs) may send others, so they are loose
 * here and cast once.
 */
const notification = (
  over: Partial<Omit<NotificationResponse, "type" | "targetType">> & {
    type: string;
    targetType?: string | null;
  }
): NotificationResponse =>
  ({
    id: "n1",
    targetType: null,
    targetId: null,
    params: {},
    readAt: null,
    createdAt: new Date("2026-10-01T05:40:00Z"),
    ...over,
  }) as NotificationResponse;

const describeAs = (
  n: NotificationResponse,
  locale: "tr" | "en" | "ar" = "tr"
) => describeNotification(n, { t: translator(locale), locale, timeZone: ZONE });

describe("describeNotification (tedris/36 sentences)", () => {
  it("words a cancelled session with its make-up session, in the viewer's zone", () => {
    const text = describeAs(
      notification({
        type: "SESSION_CANCELLED",
        params: {
          courseTitle: "Emsile ve Bina",
          sessionAt: "2026-10-04T17:00:00Z",
          makeupAt: "2026-10-07T18:00:00Z",
          source: "Abdülhamit Karaosmanoğlu",
        },
      })
    );
    expect(text.title).toBe("Celse iptal edildi");
    expect(text.body).toBe(
      "Emsile ve Bina dersinin Paz 4 Ekim 20:00 celsesi iptal edildi. Telafi celsesi Çar 7 Ekim 21:00."
    );
    expect(text.source).toBe("Abdülhamit Karaosmanoğlu");
  });

  it("leaves the make-up sentence off when there is none", () => {
    const text = describeAs(
      notification({
        type: "SESSION_CANCELLED",
        params: {
          courseTitle: "Siyer okumaları",
          sessionAt: "2026-10-08T18:00:00Z",
        },
      })
    );
    expect(text.body).toBe(
      "Siyer okumaları dersinin Per 8 Ekim 21:00 celsesi iptal edildi."
    );
  });

  it.each([
    [
      "SESSION_ADDED",
      { courseTitle: "Siyer okumaları", sessionLabel: "Hafta 3" },
      "Yeni ders kaydı",
      "Siyer okumaları dersinin Hafta 3 celsesine ders kaydı eklendi.",
    ],
    [
      "ENROLLMENT_APPROVED",
      { courseTitle: "Siyer okumaları" },
      "Başvurun onaylandı",
      "Siyer okumaları dersine kaydın onaylandı.",
    ],
    [
      "ENROLLMENT_REJECTED",
      { courseTitle: "Bina", reason: "Kontenjan doldu" },
      "Başvurun reddedildi",
      "Bina dersine başvurun reddedildi. Gerekçe: Kontenjan doldu",
    ],
    [
      "ENROLLMENT_REJECTED",
      { courseTitle: "Bina" },
      "Başvurun reddedildi",
      "Bina dersine başvurun reddedildi.",
    ],
    [
      "REMOVED_FROM_COURSE",
      { courseTitle: "Bina" },
      "Dersten çıkarıldın",
      "Bina dersinden çıkarıldın.",
    ],
    [
      "COURSE_ACCESS_REMOVED",
      { courseTitle: "Bina" },
      "Erişimin kaldırıldı",
      "Bina dersine erişimin kaldırıldı.",
    ],
    [
      "SESSION_RESCHEDULED",
      { courseTitle: "Bina", sessionAt: "2026-10-04T17:00:00Z" },
      "Celse saati değişti",
      "Bina dersinin celsesi Paz 4 Ekim 20:00 tarihine alındı.",
    ],
    [
      "KOSK_APPLICATION_RESULT",
      { koskName: "Beyazıt", outcome: "approved" },
      "Köşk başvurun onaylandı",
      "Beyazıt köşkünü açma başvurun onaylandı.",
    ],
    [
      "DECK_PUBLISH_RESULT",
      { deckTitle: "Sarf", outcome: "unpublished", reason: "Telif" },
      "Deste yayından kaldırıldı",
      "Sarf destesi yayından kaldırıldı. Gerekçe: Telif",
    ],
  ])("%s", (type, params, title, body) => {
    const text = describeAs(notification({ type, params }));
    expect(text).toMatchObject({ title, body });
  });

  it("reads a type it does not know as a plain notification, not a raw key", () => {
    const text = describeAs(notification({ type: "SOMETHING_NEW" }));
    expect(text).toEqual({ title: "Bildirim", body: "", source: null });
  });

  it("does not fail when a producer left a value out", () => {
    expect(() =>
      describeAs(notification({ type: "KOSK_APPLICATION_RESULT" }))
    ).not.toThrow();
  });

  it("has a sentence for every type in every language", () => {
    const types = Object.keys(resources.tr.tedris.NotificationsPage.types);
    expect(types).toHaveLength(9);
    for (const locale of ["tr", "en", "ar"] as const) {
      for (const type of types) {
        const text = describeAs(
          notification({
            type,
            params: {
              courseTitle: "X",
              koskName: "X",
              deckTitle: "X",
              sessionLabel: "X",
              sessionAt: "2026-10-04T17:00:00Z",
              outcome: "approved",
            },
          }),
          locale
        );
        expect(text.title, `${locale} ${type}`).not.toMatch(
          /NotificationsPage/
        );
        expect(text.body, `${locale} ${type}`).not.toMatch(/NotificationsPage/);
        expect(text.title.length).toBeGreaterThan(0);
        expect(text.body.length).toBeGreaterThan(0);
      }
    }
  });
});

describe("notificationHref", () => {
  it("leads to the course, the session's page, the deck or the köşk", () => {
    expect(
      notificationHref(
        notification({ type: "X", targetType: "COURSE", targetId: COURSE })
      )
    ).toBe(`/courses/${COURSE}`);
    expect(
      notificationHref(
        notification({
          type: "X",
          targetType: "SESSION",
          targetId: SESSION,
          params: { courseId: COURSE },
        })
      )
    ).toBe(`/courses/${COURSE}/lessons/${SESSION}`);
    expect(
      notificationHref(
        notification({ type: "X", targetType: "DECK", targetId: COURSE })
      )
    ).toBe(`/decks/${COURSE}`);
    expect(
      notificationHref(
        notification({ type: "X", targetType: "KOSK", targetId: COURSE })
      )
    ).toBe(`/kosks/${COURSE}`);
  });

  it("leads nowhere without a target, or for a session whose course is unknown", () => {
    expect(notificationHref(notification({ type: "X" }))).toBeNull();
    expect(
      notificationHref(
        notification({ type: "X", targetType: "SESSION", targetId: SESSION })
      )
    ).toBeNull();
    expect(
      notificationHref(
        notification({ type: "X", targetType: "OTHER", targetId: SESSION })
      )
    ).toBeNull();
  });
});

describe("day groups (BUGÜN / DÜN / DAHA ÖNCE)", () => {
  // 2026-10-02 10:00 in Istanbul.
  const NOW = "2026-10-02T07:00:00Z";

  it("cuts days at midnight in the viewer's zone, not in UTC", () => {
    // 00:30 Istanbul on the 2nd is still the 1st in UTC.
    expect(dayGroupOf("2026-10-01T21:30:00Z", NOW, ZONE)).toBe("today");
    expect(dayGroupOf("2026-10-01T21:30:00Z", NOW, "UTC")).toBe("yesterday");
    expect(dayGroupOf("2026-10-01T20:59:00Z", NOW, ZONE)).toBe("yesterday");
    expect(dayGroupOf("2026-09-30T20:59:00Z", NOW, ZONE)).toBe("earlier");
  });

  it("knows yesterday across a month boundary", () => {
    expect(
      dayGroupOf("2026-09-30T12:00:00Z", "2026-10-01T09:00:00Z", ZONE)
    ).toBe("yesterday");
  });

  it("groups in order, keeps the list's order and drops empty groups", () => {
    const rows = [
      notification({
        id: "a",
        type: "X",
        createdAt: new Date("2026-10-02T05:40:00Z"),
      }),
      notification({
        id: "b",
        type: "X",
        createdAt: new Date("2026-09-28T09:00:00Z"),
      }),
      notification({
        id: "c",
        type: "X",
        createdAt: new Date("2026-09-27T09:00:00Z"),
      }),
    ];
    const groups = groupByDay(rows, NOW, ZONE);
    expect(groups.map((g) => g.key)).toEqual(["today", "earlier"]);
    expect(groups[1].items.map((n) => n.id)).toEqual(["b", "c"]);
    expect(groupByDay([], NOW, ZONE)).toEqual([]);
  });

  it("shows a clock for today and yesterday and a date for older rows", () => {
    const at = new Date("2026-09-28T09:00:00Z");
    expect(formatRowTime(at, "today", "tr", ZONE)).toBe("12:00");
    expect(formatRowTime(at, "yesterday", "tr", ZONE)).toBe("12:00");
    expect(formatRowTime(at, "earlier", "tr", ZONE)).toBe("28 Eylül");
  });
});

describe("the bell's accessible name (canvas rule 10)", () => {
  const t = createTranslator({
    locale: "tr",
    messages: resources.tr.tedris,
    namespace: "UserNotifications",
  });
  const translate = (key: string, values?: Record<string, string | number>) =>
    t(key as never, values as never);

  it("says the unread count, and only the name when there is none", () => {
    expect(bellLabel(3, translate)).toBe("Bildirimler, 3 okunmamış");
    expect(bellLabel(0, translate)).toBe("Bildirimler");
  });
});

describe("small helpers", () => {
  it("falls back to the bell for an unknown type", () => {
    expect(notificationIcon("ENROLLMENT_APPROVED")).toBe("check");
    expect(notificationIcon("SOMETHING_NEW")).toBe("bell");
  });

  it("returns the input for a date it cannot read", () => {
    expect(formatSessionTime("nope", "tr", ZONE)).toBe("nope");
  });
});
