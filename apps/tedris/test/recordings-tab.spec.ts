// @vitest-environment happy-dom
import { resources } from "@medaris/i18n";
import type { RecordingResponse } from "@medaris/services/tedrisat";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, click, render } from "./dom";

const refresh = vi.hoisted(() => vi.fn());
/** The viewer's zone (MDRS-288). */
const viewerZone = vi.hoisted(() => ({ current: "Europe/Istanbul" }));

vi.mock("next-intl", async () => {
  const { resources } = await import("@medaris/i18n");
  return {
    useLocale: () => "tr",
    useTimeZone: () => viewerZone.current,
    useTranslations: (namespace: string) => {
      const read = (key: string) =>
        [...namespace.split("."), ...key.split(".")].reduce<unknown>(
          (node, part) => (node as Record<string, unknown>)?.[part],
          resources.tr
        ) as string;
      return Object.assign(
        (key: string, values?: Record<string, string | number>) =>
          read(key).replace(/\{(\w+)\}/g, (_, name) =>
            String(values?.[name] ?? "")
          ),
        { raw: read }
      );
    },
  };
});

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

afterEach(cleanup);

const rec = (id: string, over: Partial<RecordingResponse>): RecordingResponse =>
  ({
    id,
    lessonId: `l-${id}`,
    weekId: "w1",
    weekNumber: 1,
    weekTitle: "Emsile-i muhtelife",
    title: id,
    recordedAt: new Date("2026-09-05T18:00:00Z"),
    durationMinutes: 47,
    provider: "YOUTUBE",
    url: "https://youtu.be/aaaaaaaaaaa",
    visibility: "ENROLLED",
    status: "READY",
    ...over,
  }) as RecordingResponse;

// The five recordings of the design (tedris/24), newest week first.
const FIVE = [
  rec("Hafta sonu müzakeresi", {
    weekId: "w4",
    weekNumber: 4,
    weekTitle: "Mezîd fiiller ve bâblar",
    recordedAt: new Date("2026-09-27T17:00:00Z"),
    durationMinutes: null,
    status: "PROCESSING",
    url: null,
  }),
  rec("Mezîd fiiller ve bâblar: celse kaydı", {
    weekId: "w4",
    weekNumber: 4,
    weekTitle: "Mezîd fiiller ve bâblar",
    recordedAt: new Date("2026-09-26T18:00:00Z"),
    durationMinutes: 58,
    url: "https://youtu.be/mezidfiiller",
  }),
  rec("Sülâsî mücerred bâblar: celse kaydı", {
    weekId: "w3",
    weekNumber: 3,
    weekTitle: "Sülâsî mücerred bâblar",
    provider: "DRIVE",
    recordedAt: new Date("2026-09-19T18:00:00Z"),
    durationMinutes: 61,
    url: "https://drive.google.com/file/d/sulasi123456/view",
  }),
  rec("Emsile-i muttaride: mâzî ve muzâri çekimi", {
    weekId: "w2",
    weekNumber: 2,
    weekTitle: "Emsile-i muttaride",
    recordedAt: new Date("2026-09-12T18:00:00Z"),
    durationMinutes: 55,
    url: "https://youtu.be/muttaride001",
  }),
  rec("Emsile-i muhtelife: sülâsî fiilin on kalıbı", {
    weekId: "w1",
    weekNumber: 1,
    visibility: "PUBLIC",
    recordedAt: new Date("2026-09-05T18:00:00Z"),
    durationMinutes: 47,
    url: "https://youtu.be/muhtelife001",
  }),
];

const COURSE = "c1";

/**
 * The tab as a viewer who may read the content sees it, or (`watch` false)
 * one who may not. Every recording's lesson is a celse unless `celses` says
 * which are.
 */
// The page's instant: 3 Ekim 2026, before any release time below.
const NOW = Date.parse("2026-10-03T17:52:00.000Z");

const mount = async (
  recordings: RecordingResponse[] | null,
  watch = true,
  celses: ReadonlySet<string> = new Set(
    (recordings ?? []).map((r) => r.lessonId)
  )
) => {
  const { RecordingsTab } = await import(
    "~/features/courses/components/recordings-tab"
  );
  return render(
    createElement(RecordingsTab, {
      recordings,
      timeZone: "Europe/Istanbul",
      courseId: COURSE,
      celses,
      watch,
      now: NOW,
    })
  );
};

const rowOf = (host: HTMLElement, title: string) =>
  [...host.querySelectorAll("li")].find((li) =>
    li.textContent?.includes(title)
  ) as HTMLElement;

const text = (el: Element) => el.textContent?.replace(/\s+/g, " ").trim();

describe("recordings tab, read failed (design tedris/24)", () => {
  it("says it failed and offers a retry, not the empty state", async () => {
    const host = await mount(null);
    expect(text(host)).toContain("Ders kayıtları yüklenemedi");
    expect(text(host)).not.toContain("henüz yayımlanmış ders kaydı yok");
    const retry = [...host.querySelectorAll("button")].find(
      (b) => b.textContent?.trim() === "Yeniden dene"
    ) as Element;
    await click(retry);
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});

describe("recordings tab (design tedris/24, MDRS-162)", () => {
  it("groups the recordings by week, newest first, with date and length", async () => {
    const host = await mount(FIVE);
    const weeks = [
      ...host.querySelectorAll('section[aria-labelledby^="week-"]'),
    ];
    expect(
      weeks.map((w) => text(w.querySelector(".mds-eyebrow") as Element))
    ).toEqual(["Hafta 4", "Hafta 3", "Hafta 2", "Hafta 1"]);
    expect(text(host)).toContain("Haftalara göre, yeniden eskiye");
    expect(text(host)).toContain("19 Eylül 2026 · 61 dk");
    expect(text(host)).toContain("5 Eylül 2026 · 47 dk");
  });

  it("gives a recording being prepared a label and no action", async () => {
    const host = await mount(FIVE);
    const row = rowOf(host, "Hafta sonu müzakeresi");
    expect(text(row)).toContain("Hazırlanıyor");
    expect(text(row)).toContain("Hazır olunca buradan açılır");
    expect(row.querySelector("button")).toBeNull();
    expect(row.querySelector("a")).toBeNull();
  });

  it("marks a public recording and names where each one is hosted", async () => {
    const host = await mount(FIVE);
    const row = rowOf(host, "sülâsî fiilin on kalıbı");
    expect(text(row)).toContain("Herkese açık");
    expect(text(row)).toContain("YouTube");
    expect(text(rowOf(host, "Sülâsî mücerred"))).toContain("Google Drive");
  });

  it("says there are none", async () => {
    const host = await mount([]);
    expect(text(host)).toContain("henüz yayımlanmış ders kaydı yok");
    expect(host.querySelector("li")).toBeNull();
  });
});

describe("recordings tab rows open the watch page (MDRS-285)", () => {
  it("has no player and no notes panel of its own: no frame, nothing to play in place", async () => {
    const host = await mount(FIVE);
    expect(host.querySelector("iframe")).toBeNull();
    expect(host.querySelector("button")).toBeNull();
    expect(text(host)).not.toContain("Notlarım");
    expect(text(host)).not.toContain("Oynatıcıda");
  });

  it("makes every ready row one link to its celse's watch page, in this tab", async () => {
    const host = await mount(FIVE);
    const links = [...host.querySelectorAll("li a")] as HTMLAnchorElement[];
    expect(links.map((a) => a.getAttribute("href"))).toEqual([
      `/courses/${COURSE}/lessons/l-Mezîd fiiller ve bâblar: celse kaydı/izle`,
      `/courses/${COURSE}/lessons/l-Sülâsî mücerred bâblar: celse kaydı/izle`,
      `/courses/${COURSE}/lessons/l-Emsile-i muttaride: mâzî ve muzâri çekimi/izle`,
      `/courses/${COURSE}/lessons/l-Emsile-i muhtelife: sülâsî fiilin on kalıbı/izle`,
    ]);
    for (const link of links) {
      expect(link.hasAttribute("target")).toBe(false);
    }
  });

  it("names the row by what it does and describes it by its facts", async () => {
    const host = await mount(FIVE);
    const link = rowOf(host, "Emsile-i muttaride: mâzî").querySelector(
      "a"
    ) as HTMLAnchorElement;
    expect(link.getAttribute("aria-label")).toBe(
      "Kaydı izle: Emsile-i muttaride: mâzî ve muzâri çekimi"
    );
    expect(link.textContent).toContain(
      "Emsile-i muttaride: mâzî ve muzâri çekimi"
    );
    expect(
      document.getElementById(link.getAttribute("aria-describedby") ?? "")
        ?.textContent
    ).toBe("12 Eylül 2026 · 55 dk");
  });

  it("sends a Drive recording to the watch page too, which frames or opens it", async () => {
    const host = await mount(FIVE);
    const link = rowOf(host, "Sülâsî mücerred").querySelector(
      "a"
    ) as HTMLAnchorElement;
    expect(link.getAttribute("href")).toMatch(/\/izle$/);
    expect(link.getAttribute("href")).not.toContain("drive.google.com");
    expect(text(link)).not.toContain("Ders kaydını aç");
  });

  it("lists a lone recording too: there is no player above to stand for it", async () => {
    const host = await mount([FIVE[4]]);
    expect(text(host)).toContain("Bütün ders kayıtları");
    expect(host.querySelectorAll("li")).toHaveLength(1);
    expect(host.querySelector("li a")?.getAttribute("href")).toBe(
      `/courses/${COURSE}/lessons/l-Emsile-i muhtelife: sülâsî fiilin on kalıbı/izle`
    );
  });

  it("opens a ready recording at its host, in a new tab, for a viewer who may not read the content", async () => {
    const host = await mount([FIVE[4], FIVE[0]], false);
    const link = rowOf(host, "sülâsî fiilin on kalıbı").querySelector(
      "a"
    ) as HTMLAnchorElement;
    expect(link.getAttribute("href")).toBe("https://youtu.be/muhtelife001");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
    expect(link.getAttribute("aria-label")).toBe(
      "Ders kaydını aç: Emsile-i muhtelife: sülâsî fiilin on kalıbı (yeni sekmede açılır)"
    );
    expect(host.querySelector('a[href$="/izle"]')).toBeNull();
    expect(rowOf(host, "Hafta sonu müzakeresi").querySelector("a")).toBeNull();
  });

  it("opens at its host the recording of a lesson that is not a celse: only a celse has a watch page", async () => {
    const celse = FIVE[3];
    const video = FIVE[4];
    const host = await mount([celse, video], true, new Set([celse.lessonId]));
    const link = rowOf(host, "sülâsî fiilin on kalıbı").querySelector(
      "a"
    ) as HTMLAnchorElement;
    expect(link.getAttribute("href")).toBe("https://youtu.be/muhtelife001");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(
      rowOf(host, "Emsile-i muttaride").querySelector("a")?.getAttribute("href")
    ).toBe(`/courses/${COURSE}/lessons/${celse.lessonId}/izle`);
  });

  it("prints a week whose title only names the week once", async () => {
    const host = await mount([
      rec("Celse kaydı", {
        weekId: "w3",
        weekNumber: 3,
        weekTitle: "Hafta 3",
        url: "https://youtu.be/hafta3aaaaa",
      }),
      rec("Eski kayıt", {
        weekId: "w2",
        weekNumber: 2,
        weekTitle: "Emsile-i muttaride",
        url: "https://youtu.be/hafta2aaaaa",
      }),
    ]);
    const headings = [
      ...host.querySelectorAll('section[aria-labelledby^="week-"] h3'),
    ].map((h) => text(h));
    expect(headings).toEqual(["Hafta 3", "Hafta 2 Emsile-i muttaride"]);
  });
});

describe("recordings tab, Bunny recordings (MDRS-114)", () => {
  // A player link as tedrisat signs it for one viewer (MDRS-119).
  const SIGNED =
    "https://player.mediadelivery.net/embed/424242/3f1c2b4a-5d6e-4f70-8a9b-0c1d2e3f4a5b?token=9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08&expires=1790000000";
  const bunny = rec("Hafta sonu müzakeresi: Bunny kaydı", {
    weekId: "w5",
    weekNumber: 5,
    weekTitle: "Mehmûz fiiller",
    provider: "BUNNY",
    recordedAt: new Date("2026-10-03T18:00:00Z"),
    durationMinutes: 52,
    url: SIGNED,
  });

  it("names the platform and opens the watch page, where the signed link plays; the link is not in the row", async () => {
    const host = await mount([bunny, ...FIVE]);
    const row = rowOf(host, "Bunny kaydı");
    expect(text(row)).toContain("Bunny Stream");
    const link = row.querySelector("a") as HTMLAnchorElement;
    expect(link.getAttribute("href")).toBe(
      `/courses/${COURSE}/lessons/l-Hafta sonu müzakeresi: Bunny kaydı/izle`
    );
    expect(host.innerHTML).not.toContain("mediadelivery");
  });
});

describe("recordings tab, a recording held back until its release time (MDRS-288)", () => {
  // 14 Ekim 2026 Çarşamba 20:00 in İstanbul, after NOW.
  const AT = new Date("2026-10-14T17:00:00.000Z");
  const LINE = "Ders kaydı 14 Ekim Çarşamba 20:00’de açılır.";
  const held = rec("Mehmûz fiiller: celse kaydı", {
    // An id without spaces, as the API's are: a row names two of them.
    id: "r-mehmuz",
    weekId: "w5",
    weekNumber: 5,
    weekTitle: "Mehmûz fiiller",
    recordedAt: new Date("2026-10-02T18:00:00Z"),
    durationMinutes: 52,
    url: null,
    availableAt: AT,
  });
  afterEach(() => {
    viewerZone.current = "Europe/Istanbul";
  });

  it("lists it to a talebe with when it opens, and plays nothing", async () => {
    const host = await mount([held, ...FIVE]);
    const row = rowOf(host, "Mehmûz fiiller: celse kaydı");
    expect(text(row)).toContain(LINE);
    expect(text(row)).toContain("2 Ekim 2026 · 52 dk");
    expect(row.querySelector("a")).toBeNull();
    expect(row.querySelector("button")).toBeNull();
    // It is ready, only not open yet.
    expect(text(row)).not.toContain("Hazırlanıyor");
    expect(text(row)).toContain("YouTube");
  });

  it("lists a visitor's public recording the same way, with no link out", async () => {
    const host = await mount([{ ...held, visibility: "PUBLIC" }], false);
    const row = rowOf(host, "Mehmûz fiiller: celse kaydı");
    expect(text(row)).toContain(LINE);
    expect(text(row)).toContain("Herkese açık");
    expect(row.querySelector("a")).toBeNull();
  });

  it("names the course's zone and the viewer's clock when that shows another time", async () => {
    viewerZone.current = "Europe/Berlin";
    const host = await mount([held]);
    expect(text(rowOf(host, "Mehmûz fiiller"))).toContain(
      `${LINE} İstanbul saatiyle · 19:00 senin saatinle`
    );
  });

  it("lets the course team play it from its row, marked with the time talebe may", async () => {
    const early = { ...held, url: "https://youtu.be/mehmuzfiil1" };
    const host = await mount([early]);
    const link = rowOf(host, "Mehmûz fiiller").querySelector(
      "a"
    ) as HTMLAnchorElement;
    expect(link.getAttribute("href")).toBe(
      `/courses/${COURSE}/lessons/l-Mehmûz fiiller: celse kaydı/izle`
    );
    expect(text(link)).toContain(
      "Talebelere 14 Ekim Çarşamba 20:00’de açılacak"
    );
    const described = (link.getAttribute("aria-describedby") ?? "")
      .split(" ")
      .map((id) => text(document.getElementById(id) as Element));
    expect(described).toEqual([
      "2 Ekim 2026 · 52 dk",
      "Talebelere 14 Ekim Çarşamba 20:00’de açılacak",
    ]);
  });

  it("says nothing once the time has come, or with none ('Hazır olunca hemen')", async () => {
    for (const availableAt of [new Date(NOW - 60_000), null]) {
      const host = await mount([
        { ...held, url: "https://youtu.be/mehmuzfiil1", availableAt },
      ]);
      const row = rowOf(host, "Mehmûz fiiller");
      expect(row.querySelector("[data-recording-release]")).toBeNull();
      expect(row.querySelector("a")?.getAttribute("href")).toMatch(/\/izle$/);
      await cleanup();
    }
  });
});

describe("recordings tab strings", () => {
  it("has every key in every locale", () => {
    const keys = Object.keys(resources.tr.tedrisLearn.RecordingsTab).sort();
    for (const locale of ["en", "ar"] as const) {
      expect(
        Object.keys(resources[locale].tedrisLearn.RecordingsTab).sort()
      ).toEqual(keys);
    }
  });

  it("has every release key in every locale (MDRS-288)", () => {
    const keys = Object.keys(resources.tr.tedrisLearn.RecordingRelease).sort();
    expect(keys).toEqual(["early", "opens", "zone"]);
    for (const locale of ["en", "ar"] as const) {
      expect(
        Object.keys(resources[locale].tedrisLearn.RecordingRelease).sort()
      ).toEqual(keys);
      expect(
        resources[locale].tedrisLearn.WatchPage.streamEndedHeldText
      ).toBeTruthy();
    }
  });
});
