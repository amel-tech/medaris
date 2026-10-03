import type { GrantResponse } from "@medaris/services/tedrisat";
import { describe, expect, it } from "vitest";
import {
  footnoteParts,
  grantCards,
  momentLabel,
  muderrisLine,
  pendingTotal,
  platformView,
  sessionAction,
  sessionState,
  sessionWhen,
  sessionWhenLong,
  weekLine,
} from "~/features/dashboard/present";
import { filterByPermissions, navGroups } from "~/lib/shell-nav";

const zone = { locale: "tr", timeZone: "Europe/Istanbul" };
const words = { today: "Bugün", yesterday: "Dün" };
// 3 October 2026, 10:00 in Istanbul
const NOW = new Date("2026-10-03T07:00:00Z");

describe("the greeting's number (nizam 01 and 05)", () => {
  it("adds the four queues of the başnazım: 3 + 2 + 2 + 2", () => {
    expect(
      pendingTotal({
        koskApplications: 3,
        deckPublishRequests: 2,
        appeals: 2,
        permanentBanRequests: 2,
      })
    ).toBe(9);
  });

  it("adds only the sections a Medaris nazımı is shown: 3 + 2 + 2", () => {
    expect(
      pendingTotal({
        koskApplications: 3,
        deckPublishRequests: 2,
        permanentBanRequests: 2,
      })
    ).toBe(7);
  });

  it("is zero when nothing is shown", () => {
    expect(pendingTotal({})).toBe(0);
  });
});

describe("momentLabel (nizam 01: Bugün 08:45, Dün 16:30, 29 Eyl 14:20)", () => {
  it("names today and yesterday and dates the rest, in the viewer's zone", () => {
    expect(momentLabel("2026-10-03T05:45:00Z", NOW, zone, words)).toBe(
      "Bugün 08:45"
    );
    expect(momentLabel("2026-10-02T13:30:00Z", NOW, zone, words)).toBe(
      "Dün 16:30"
    );
    expect(momentLabel("2026-09-29T11:20:00Z", NOW, zone, words)).toBe(
      "29 Eyl 14:20"
    );
  });

  it("decides the day in the viewer's zone, not UTC", () => {
    // 22:30 UTC on the 2nd is 01:30 on the 3rd in Istanbul: today
    expect(momentLabel("2026-10-02T22:30:00Z", NOW, zone, words)).toBe(
      "Bugün 01:30"
    );
  });
});

describe("celse times (nizam 02)", () => {
  it("prints the table's short form and the alert's long form", () => {
    expect(sessionWhen("2026-10-03T18:00:00Z", zone)).toBe("3 Eki Cmt 21:00");
    expect(sessionWhenLong("2026-10-03T18:00:00Z", zone)).toBe(
      "3 Ekim Cumartesi 21:00"
    );
  });
});

describe("a celse's state and button (nizam 02)", () => {
  const ahead = new Date(NOW.getTime() + 3_600_000);
  const behind = new Date(NOW.getTime() - 3_600_000);

  it("says a missing link first, then planned, cancelled and past", () => {
    expect(sessionState({ cancelled: false, scheduledAt: ahead }, NOW)).toBe(
      "missingLink"
    );
    expect(
      sessionState(
        {
          cancelled: false,
          scheduledAt: ahead,
          meetingUrl: "https://zoom.us/j/1",
        },
        NOW
      )
    ).toBe("planned");
    expect(sessionState({ cancelled: true, scheduledAt: ahead }, NOW)).toBe(
      "cancelled"
    );
    expect(
      sessionState(
        {
          cancelled: false,
          scheduledAt: behind,
          meetingUrl: "https://zoom.us/j/1",
        },
        NOW
      )
    ).toBe("past");
  });

  it("adds the link, edits what is planned, looks at what is over", () => {
    expect(sessionAction("missingLink")).toBe("addLink");
    expect(sessionAction("planned")).toBe("edit");
    expect(sessionAction("past")).toBe("view");
    expect(sessionAction("cancelled")).toBe("view");
  });

  it("reads the platform off the link", () => {
    expect(platformView("https://zoom.us/j/123")).toEqual({ platform: "zoom" });
    expect(platformView("https://meet.google.com/abc-defg")).toEqual({
      platform: "google-meet",
    });
    expect(platformView("https://meet.example.org/x")).toEqual({
      platform: "other",
      host: "meet.example.org",
    });
    expect(platformView(undefined)).toBeNull();
    expect(platformView("  ")).toBeNull();
  });

  it("writes the lines under a course", () => {
    const week = (n: number) => `Hafta ${n}`;
    expect(
      weekLine(
        { weekNumber: 5, isMakeup: true },
        { week, makeup: "telafi celsesi" }
      )
    ).toBe("Hafta 5, telafi celsesi");
    expect(
      weekLine(
        { weekNumber: 4, isMakeup: false },
        { week, makeup: "telafi celsesi" }
      )
    ).toBe("Hafta 4");
    expect(
      muderrisLine(
        [
          { name: "Mehmet Emin Işıkoğlu", isImam: true },
          { name: "Ayşe Nur Kılıçarslan", isImam: false },
        ],
        "imam"
      )
    ).toBe("Mehmet Emin Işıkoğlu, imam · Ayşe Nur Kılıçarslan");
  });
});

const grant = (over: Partial<GrantResponse>): GrantResponse => ({
  id: "g",
  scopeType: "platform",
  grantedAt: new Date("2026-09-14T09:00:00Z"),
  grantedBy: { id: "c", displayName: "Yusuf Ziya Ertuğrul" },
  grantedBySelf: false,
  ...over,
});

describe("the cards under İzinleriniz (nizam 05)", () => {
  const grants: GrantResponse[] = [
    grant({
      id: "p1",
      permission: "platform.deck_publish",
      expiresAt: new Date("2026-12-31T20:59:59Z"),
    }),
    grant({
      id: "p2",
      permission: "platform.ban_account",
      grantedAt: new Date("2026-09-30T09:00:00Z"),
    }),
    grant({
      id: "gr",
      group: {
        id: "grp",
        name: "Köşk işleri",
        permissions: ["platform.kosk_create", "platform.kosk_edit"],
      },
      expiresAt: new Date("2026-12-31T20:59:59Z"),
    }),
    grant({ id: "k", scopeType: "kosk", permission: "kosk.manage" }),
  ];

  it("lists the platform's grants only, groups first", () => {
    const cards = grantCards(grants);
    expect(cards.map((c) => c.id)).toEqual(["gr", "p1", "p2"]);
    expect(cards[0]).toMatchObject({
      kind: "group",
      name: "Köşk işleri",
      codes: ["platform.kosk_create", "platform.kosk_edit"],
    });
    expect(cards[1]).toMatchObject({
      kind: "permission",
      codes: ["platform.deck_publish"],
    });
  });

  it("keeps an open end open: no date, no invented one", () => {
    const cards = grantCards(grants);
    expect(cards[0]?.expiresAt).toBeInstanceOf(Date);
    expect(cards[2]?.expiresAt).toBeNull();
  });

  it("names who gave them and the day most were given, with the exceptions", () => {
    const parts = footnoteParts(grantCards(grants), (d) =>
      d.toISOString().slice(0, 10)
    );
    expect(parts.givers).toEqual(["Yusuf Ziya Ertuğrul"]);
    expect(parts.commonDay).toBe("2026-09-14");
    expect(parts.others).toHaveLength(1);
    expect(parts.others[0]).toMatchObject({ day: "2026-09-30" });
  });

  it("has no common day when there is nothing", () => {
    expect(footnoteParts([], String)).toEqual({
      givers: [],
      commonDay: null,
      others: [],
    });
  });
});

describe("the Medaris nazımı's menu (nizam 05)", () => {
  const ids = (held: string[] | null) =>
    filterByPermissions(
      navGroups("medaris"),
      held ? new Set(held) : null
    ).flatMap((g) => g.items.map((i) => i.id));

  it("shows only what the permissions open", () => {
    expect(
      ids([
        "platform.kosk_create",
        "platform.kosk_application_decide",
        "platform.deck_publish",
        "platform.ban_account",
      ])
    ).toEqual([
      "home",
      "notifications",
      "kosks",
      "kosk-applications",
      "deck-requests",
      "permanent-bans",
      "bans",
    ]);
  });

  it("leaves out a group with no item left", () => {
    const groups = filterByPermissions(
      navGroups("medaris"),
      new Set(["platform.kosk_application_decide"])
    );
    expect(groups.map((g) => g.id)).toEqual(["general", "requests"]);
  });

  it("hides nothing when the permissions could not be read", () => {
    expect(ids(null)).toEqual(
      navGroups("medaris").flatMap((g) => g.items.map((i) => i.id))
    );
  });

  it("gives a köşk nazımı a home page in their köşk's path", () => {
    const home = navGroups("kosk")[0]?.items[0];
    expect(home).toMatchObject({ id: "home", path: "/kosks/:kosk/ana-sayfa" });
  });
});
