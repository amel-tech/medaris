// @vitest-environment happy-dom
import { resources } from "@medaris/i18n";
import type { RecordingResponse } from "@medaris/services/tedrisat";
import { createElement, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, click, render } from "./dom";

const refresh = vi.hoisted(() => vi.fn());

vi.mock("next-intl", async () => {
  const { resources } = await import("@medaris/i18n");
  return {
    useLocale: () => "tr",
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

// The real player frames a third-party page, which happy-dom would try to
// fetch. The stand-in keeps what the tab decides (title, address, facts); the
// frame itself is covered by session-page.spec.ts.
vi.mock("~/features/courses/components/media-player", () => ({
  MediaPlayer: ({
    id,
    title,
    embedUrl,
    frameTitle,
    children,
  }: {
    id: string;
    title: string;
    embedUrl: string | null;
    frameTitle?: string;
    children?: ReactNode;
  }) =>
    createElement(
      "section",
      { "data-embed": embedUrl, "data-frame-title": frameTitle ?? "" },
      createElement("h2", { id }, title),
      createElement("p", null, children)
    ),
}));

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

const mount = async (recordings: RecordingResponse[] | null) => {
  const { RecordingsTab } = await import(
    "~/features/courses/components/recordings-tab"
  );
  return render(
    createElement(RecordingsTab, {
      recordings,
      timeZone: "Europe/Istanbul",
    })
  );
};

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
    const weeks = [...host.querySelectorAll("section.mds-card")].filter((s) =>
      s.querySelector(".mds-eyebrow")
    );
    expect(
      weeks.map((w) => text(w.querySelector(".mds-eyebrow") as Element))
    ).toEqual(["Hafta 4", "Hafta 3", "Hafta 2", "Hafta 1"]);
    expect(text(host)).toContain("Haftalara göre, yeniden eskiye");
    expect(text(host)).toContain("19 Eylül 2026 · 61 dk");
    expect(text(host)).toContain("5 Eylül 2026 · 47 dk");
  });

  it("starts the player on the newest recording that plays in it", async () => {
    const host = await mount(FIVE);
    const player = host.querySelector("#recording-player") as HTMLElement;
    expect(player.textContent).toBe("Mezîd fiiller ve bâblar: celse kaydı");
    expect(host.querySelector("[data-embed]")?.getAttribute("data-embed")).toBe(
      "https://www.youtube-nocookie.com/embed/mezidfiiller"
    );
    expect(text(host)).toContain("Hafta 4 · 26 Eylül 2026 Cumartesi · 58 dk");
    expect(text(host)).toContain("Oynatıcıda");
  });

  it("gives a recording being prepared a label and no action", async () => {
    const host = await mount(FIVE);
    const row = [...host.querySelectorAll("li")].find((li) =>
      li.textContent?.includes("Hafta sonu müzakeresi")
    ) as HTMLElement;
    expect(text(row)).toContain("Hazırlanıyor");
    expect(text(row)).toContain("Hazır olunca burada oynar");
    expect(row.querySelector("button")).toBeNull();
    expect(row.querySelector("a")).toBeNull();
  });

  it("opens a Drive recording in a new tab instead of playing it", async () => {
    const host = await mount(FIVE);
    const row = [...host.querySelectorAll("li")].find((li) =>
      li.textContent?.includes("Sülâsî mücerred")
    ) as HTMLElement;
    expect(text(row)).toContain("Google Drive");
    const link = row.querySelector("a") as HTMLAnchorElement;
    expect(link.textContent).toContain("Ders kaydını aç");
    expect(link.getAttribute("href")).toBe(
      "https://drive.google.com/file/d/sulasi123456/view"
    );
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
    expect(row.querySelector("button")).toBeNull();
  });

  it("marks a public recording and offers Oynat on YouTube ones", async () => {
    const host = await mount(FIVE);
    const row = [...host.querySelectorAll("li")].find((li) =>
      li.textContent?.includes("sülâsî fiilin on kalıbı")
    ) as HTMLElement;
    expect(text(row)).toContain("Herkese açık");
    expect(text(row)).toContain("YouTube");
    expect(text(row)).toContain("Oynat");
  });

  it("loads the chosen recording into the player on Oynat", async () => {
    const host = await mount(FIVE);
    const row = [...host.querySelectorAll("li")].find((li) =>
      li.textContent?.includes("Emsile-i muttaride: mâzî")
    ) as HTMLElement;
    await click(row.querySelector("button") as HTMLElement);
    expect(
      (host.querySelector("#recording-player") as HTMLElement).textContent
    ).toBe("Emsile-i muttaride: mâzî ve muzâri çekimi");
    expect(host.querySelector("[data-embed]")?.getAttribute("data-embed")).toBe(
      "https://www.youtube-nocookie.com/embed/muttaride001"
    );
    expect(text(host)).toContain("Hafta 2 · 12 Eylül 2026 Cumartesi · 55 dk");
  });

  it("says there are none, and draws no player", async () => {
    const host = await mount([]);
    expect(text(host)).toContain("henüz yayımlanmış ders kaydı yok");
    expect(host.querySelector("[data-embed]")).toBeNull();
  });

  it("draws no player when nothing plays in it", async () => {
    const host = await mount([FIVE[0], FIVE[2]]);
    expect(host.querySelector("#recording-player")).toBeNull();
    expect(text(host)).toContain("Bütün ders kayıtları");
  });
});

describe("recordings tab, Bunny recordings (MDRS-114)", () => {
  // A player link as tedrisat signs it for one viewer (MDRS-119).
  const SIGNED =
    "https://player.mediadelivery.net/embed/424242/3f1c2b4a-5d6e-4f70-8a9b-0c1d2e3f4a5b?token=9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08&expires=1790000000";
  const bunny = (url: string) =>
    rec("Hafta sonu müzakeresi: Bunny kaydı", {
      weekId: "w5",
      weekNumber: 5,
      weekTitle: "Mehmûz fiiller",
      provider: "BUNNY",
      recordedAt: new Date("2026-10-03T18:00:00Z"),
      durationMinutes: 52,
      url,
    });

  it("plays the newest one in the player, on the very link the API signed", async () => {
    const host = await mount([bunny(SIGNED), ...FIVE]);
    expect(
      (host.querySelector("#recording-player") as HTMLElement).textContent
    ).toBe("Hafta sonu müzakeresi: Bunny kaydı");
    const player = host.querySelector("[data-embed]") as HTMLElement;
    expect(player.getAttribute("data-embed")).toBe(SIGNED);
    expect(player.getAttribute("data-frame-title")).toBe(
      "Ders kaydı oynatıcısı: Hafta sonu müzakeresi: Bunny kaydı"
    );
  });

  it("offers Oynat on its row, with the platform chip, and loads it on click", async () => {
    const host = await mount([...FIVE, bunny(SIGNED)]);
    const row = [...host.querySelectorAll("li")].find((li) =>
      li.textContent?.includes("Bunny kaydı")
    ) as HTMLElement;
    expect(text(row)).toContain("Bunny Stream");
    expect(row.querySelector("a")).toBeNull();
    await click(row.querySelector("button") as HTMLElement);
    expect(host.querySelector("[data-embed]")?.getAttribute("data-embed")).toBe(
      SIGNED
    );
  });

  it("opens a Bunny link it will not frame in a new tab instead of playing it", async () => {
    const foreign = SIGNED.replace("player.", "iframe.");
    const host = await mount([bunny(foreign)]);
    expect(host.querySelector("#recording-player")).toBeNull();
    const link = host.querySelector("li a") as HTMLAnchorElement;
    expect(link.getAttribute("href")).toBe(foreign);
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
  });

  it("gives a YouTube recording in the player no frame title of its own", async () => {
    const host = await mount([bunny(SIGNED), ...FIVE]);
    const row = [...host.querySelectorAll("li")].find((li) =>
      li.textContent?.includes("Emsile-i muttaride: mâzî")
    ) as HTMLElement;
    await click(row.querySelector("button") as HTMLElement);
    const player = host.querySelector("[data-embed]") as HTMLElement;
    expect(player.getAttribute("data-embed")).toBe(
      "https://www.youtube-nocookie.com/embed/muttaride001"
    );
    expect(player.getAttribute("data-frame-title")).toBe("");
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
});
