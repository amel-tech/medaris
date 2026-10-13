import type { GrantResponse } from "@medaris/services/tedrisat";
import { describe, expect, it } from "vitest";
import {
  footnoteParts,
  grantCards,
  momentLabel,
  muderrisLine,
  pendingTotal,
  sessionAction,
  sessionAttendance,
  sessionState,
  sessionWhen,
  sessionWhenLong,
  stateWord,
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

  it("says a celse nobody can attend first, then planned, cancelled and past (MDRS-283)", () => {
    const row = { cancelled: false, scheduledAt: ahead, withoutAccess: false };
    expect(sessionState({ ...row, withoutAccess: true }, NOW)).toBe(
      "withoutAccess"
    );
    expect(sessionState(row, NOW)).toBe("planned");
    expect(
      sessionState({ ...row, cancelled: true, withoutAccess: true }, NOW)
    ).toBe("cancelled");
    expect(sessionState({ ...row, scheduledAt: behind }, NOW)).toBe("past");
  });

  it("says Durum once: a celse nobody can attend is still planned there", () => {
    expect(stateWord("withoutAccess")).toBe("planned");
    expect(stateWord("planned")).toBe("planned");
    expect(stateWord("cancelled")).toBe("cancelled");
    expect(stateWord("past")).toBe("past");
  });

  it("adds a way in, edits what is planned, looks at what is over", () => {
    expect(sessionAction("withoutAccess")).toBe("addLink");
    expect(sessionAction("planned")).toBe("edit");
    expect(sessionAction("past")).toBe("view");
    expect(sessionAction("cancelled")).toBe("view");
  });

  it("draws Katılım from the link, the stream and the in-person mark, flagged as tedrisat says (MDRS-283)", () => {
    const row = {
      meetingUrl: null,
      hasLiveStream: false,
      inPerson: false,
      withoutAccess: true,
    };
    expect(sessionAttendance(row, false)).toEqual({
      inPerson: false,
      platform: null,
      stream: null,
      lack: "missing",
    });
    expect(
      sessionAttendance(
        { ...row, hasLiveStream: true, withoutAccess: false },
        false
      )
    ).toEqual({ inPerson: false, platform: null, stream: "alone", lack: null });
    expect(
      sessionAttendance({ ...row, inPerson: true, withoutAccess: false }, false)
    ).toEqual({ inPerson: true, platform: null, stream: null, lack: null });
    expect(
      sessionAttendance(
        {
          ...row,
          meetingUrl: "https://zoom.us/j/123",
          hasLiveStream: true,
          withoutAccess: false,
        },
        false
      )
    ).toEqual({
      inPerson: false,
      platform: { id: "zoom", host: "zoom.us" },
      stream: "beside",
      lack: null,
    });
    // a celse that is over with nothing is said plainly, not flagged
    expect(
      sessionAttendance({ ...row, withoutAccess: false }, false)?.lack
    ).toBe("none");
  });

  it("claims nothing for a content-locked row, which carries no attendance (MDRS-283 review)", () => {
    // the link, the stream, the in-person mark and the flag are not sent
    expect(sessionAttendance({}, true)).toBeNull();
    // and a row that did carry them is not read either
    expect(
      sessionAttendance({ inPerson: true, withoutAccess: true }, true)
    ).toBeNull();
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
    // the imam is the star after the name, among more than one müderris
    expect(
      muderrisLine([
        { name: "Mehmet Emin Işıkoğlu", isImam: true },
        { name: "Ayşe Nur Kılıçarslan", isImam: false },
      ])
    ).toEqual([
      { name: "Mehmet Emin Işıkoğlu", imam: true },
      { name: "Ayşe Nur Kılıçarslan", imam: false },
    ]);
    // a lone müderris is the imam and gets no mark (2026-10-13)
    expect(
      muderrisLine([{ name: "Mehmet Emin Işıkoğlu", isImam: true }])
    ).toEqual([{ name: "Mehmet Emin Işıkoğlu", imam: false }]);
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

  it("shows Medreseler for exactly the codes its page opens to, so it never leads to a 403 (MDRS-108)", () => {
    for (const code of [
      "platform.madrasah_create",
      "platform.madrasah_edit",
      "platform.head_muderris_manage",
    ]) {
      expect(ids([code])).toContain("madrasahs");
    }
    // `GET /madrasahs/directory` refuses a nazır grant, and the page has nothing for it.
    expect(ids(["platform.madrasah_nazir_grant"])).not.toContain("madrasahs");
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
