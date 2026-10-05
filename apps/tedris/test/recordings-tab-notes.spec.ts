// @vitest-environment happy-dom
import type { RecordingResponse } from "@medaris/services/tedrisat";
import { createElement, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, click, render, settle } from "./dom";

/**
 * The notes panel beside the recordings tab's player (MDRS-150): drawn for an
 * enrolled talebe, for the recording in the player, with the frame ready for
 * the player API. What the panel does is `lesson-notes.spec.ts`.
 */

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

vi.mock("~/features/courses/components/media-player", () => ({
  MediaPlayer: ({
    title,
    embedUrl,
    frameId,
  }: {
    title: string;
    embedUrl: string | null;
    frameId?: string;
    children?: ReactNode;
  }) =>
    createElement("section", {
      "data-player": title,
      "data-embed": embedUrl,
      "data-frame": frameId ?? "",
    }),
}));
vi.mock("~/features/courses/components/lesson-notes", () => ({
  LessonNotes: ({
    lessonId,
    frameId,
  }: {
    lessonId: string;
    frameId?: string | null;
  }) =>
    createElement("aside", {
      "data-notes": lessonId,
      "data-notes-frame": frameId ?? "manual",
    }),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

afterEach(cleanup);

const rec = (id: string, over: Partial<RecordingResponse>): RecordingResponse =>
  ({
    id,
    lessonId: `lesson-${id}`,
    weekId: "w1",
    weekNumber: 1,
    weekTitle: "Emsile",
    title: id,
    recordedAt: new Date("2026-09-05T18:00:00Z"),
    durationMinutes: 47,
    provider: "YOUTUBE",
    url: "https://youtu.be/aaaaaaaaaaa",
    visibility: "ENROLLED",
    status: "READY",
    ...over,
  }) as RecordingResponse;

const RECORDINGS = [
  rec("yeni", { url: "https://youtu.be/bbbbbbbbbbb" }),
  rec("eski", { url: "https://youtu.be/ccccccccccc" }),
  rec("drive", {
    provider: "DRIVE",
    url: "https://drive.google.com/file/d/abcDEF123456/view",
  }),
];

const mount = async (notes?: boolean, recordings = RECORDINGS) => {
  const { RecordingsTab } = await import(
    "~/features/courses/components/recordings-tab"
  );
  const host = await render(
    createElement(RecordingsTab, {
      recordings,
      timeZone: "Europe/Istanbul",
      ...(notes === undefined ? {} : { notes }),
    })
  );
  await settle();
  return host;
};

describe("the recordings tab's notes panel", () => {
  it("is drawn for an enrolled talebe, on the recording in the player", async () => {
    const host = await mount(true);
    expect(host.querySelector("[data-notes]")?.getAttribute("data-notes")).toBe(
      "lesson-yeni"
    );
    expect(
      host.querySelector("[data-player]")?.getAttribute("data-embed")
    ).toBe("https://www.youtube-nocookie.com/embed/bbbbbbbbbbb?enablejsapi=1");
    const frame = host
      .querySelector("[data-player]")
      ?.getAttribute("data-frame");
    expect(frame).toBe("recording-frame-yeni");
    expect(
      host.querySelector("[data-notes]")?.getAttribute("data-notes-frame")
    ).toBe(frame);
  });

  it("follows the player to another recording, and its frame with it", async () => {
    const host = await mount(true);
    const play = host.querySelector(
      'button[aria-label="Oynat: eski"]'
    ) as HTMLButtonElement;
    await click(play);
    await settle();
    expect(host.querySelector("[data-notes]")?.getAttribute("data-notes")).toBe(
      "lesson-eski"
    );
    expect(
      host.querySelector("[data-notes]")?.getAttribute("data-notes-frame")
    ).toBe("recording-frame-eski");
    expect(
      host.querySelector("[data-player]")?.getAttribute("data-frame")
    ).toBe("recording-frame-eski");
  });

  it("comes under the player, at every width (MDRS-280)", async () => {
    const host = await mount(true);
    const player = host.querySelector("[data-player]") as HTMLElement;
    const panel = host.querySelector("[data-notes]") as HTMLElement;
    // the player first, the panel after it, in the same block
    expect(
      player.compareDocumentPosition(panel) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    const block = player.parentElement as HTMLElement;
    expect(block).toBe(panel.parentElement);
    expect(block.hasAttribute("data-player-with-notes")).toBe(true);
    // one column: no grid of two, no container or viewport query to make one
    const classes = (block.getAttribute("class") ?? "").split(/\s+/);
    expect(classes).toContain("flex-col");
    expect(classes.filter((c) => c.includes("grid-cols"))).toEqual([]);
    const all = [...host.querySelectorAll("[class]")].flatMap((el) =>
      (el.getAttribute("class") ?? "").split(/\s+/)
    );
    expect(all.filter((c) => /^(max-)?(sm|lg|xl|2xl):/.test(c))).toEqual([]);
  });

  it("stays with a Bunny recording, asking for a typed time (MDRS-114)", async () => {
    const signed =
      "https://player.mediadelivery.net/embed/424242/3f1c2b4a-5d6e-4f70-8a9b-0c1d2e3f4a5b?token=9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08&expires=1790000000";
    const host = await mount(true, [
      rec("bunny", { provider: "BUNNY", url: signed }),
      ...RECORDINGS,
    ]);
    expect(host.querySelector("[data-notes]")?.getAttribute("data-notes")).toBe(
      "lesson-bunny"
    );
    expect(
      host.querySelector("[data-notes]")?.getAttribute("data-notes-frame")
    ).toBe("manual");
    expect(
      host.querySelector("[data-player]")?.getAttribute("data-embed")
    ).toBe(signed);
  });

  it.each([
    ["by default", undefined],
    ["when the viewer may not take notes", false],
  ])("is not drawn %s, and the frame is as it was", async (_label, notes) => {
    const host = await mount(notes);
    expect(host.querySelector("[data-notes]")).toBeNull();
    expect(
      host.querySelector("[data-player]")?.getAttribute("data-embed")
    ).toBe("https://www.youtube-nocookie.com/embed/bbbbbbbbbbb");
    expect(
      host.querySelector("[data-player]")?.getAttribute("data-frame")
    ).toBe("");
  });
});
