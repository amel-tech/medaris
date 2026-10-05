import type { RecordingResponse } from "@medaris/services/tedrisat";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

/**
 * The frame the recordings tab really draws (MDRS-114), rendered to markup
 * with the real player card: `recordings-tab.spec.ts` stands the card in for
 * happy-dom, which would fetch a framed page.
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
      return (key: string, values?: Record<string, string | number>) =>
        read(key).replace(/\{(\w+)\}/g, (_, name) =>
          String(values?.[name] ?? "")
        );
    },
  };
});
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

// A player link as tedrisat signs it for one viewer (MDRS-119).
const SIGNED =
  "https://player.mediadelivery.net/embed/424242/3f1c2b4a-5d6e-4f70-8a9b-0c1d2e3f4a5b?token=9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08&expires=1790000000";

const rec = (over: Partial<RecordingResponse>): RecordingResponse =>
  ({
    id: "r1",
    lessonId: "l1",
    weekId: "w1",
    weekNumber: 1,
    weekTitle: "Emsile",
    title: "Emsile-i muhtelife",
    recordedAt: new Date("2026-09-05T18:00:00Z"),
    durationMinutes: 47,
    provider: "BUNNY",
    url: SIGNED,
    visibility: "ENROLLED",
    status: "READY",
    ...over,
  }) as RecordingResponse;

const frameOf = async (recording: RecordingResponse) => {
  const { RecordingsTab } = await import(
    "~/features/courses/components/recordings-tab"
  );
  const html = renderToStaticMarkup(
    createElement(RecordingsTab, {
      recordings: [recording],
      timeZone: "Europe/Istanbul",
    })
  );
  return html.match(/<iframe[^>]*>/g) ?? [];
};

describe("the recordings tab's frame", () => {
  it("is Bunny's player on the very link the API signed", async () => {
    const frames = await frameOf(rec({}));
    expect(frames).toHaveLength(1);
    const [frame] = frames;
    expect(frame).toContain(`src="${SIGNED.replaceAll("&", "&amp;")}"`);
    expect(frame).toContain(
      'title="Ders kaydı oynatıcısı: Emsile-i muhtelife"'
    );
    expect(frame).toContain(
      'allow="autoplay; encrypted-media; picture-in-picture; fullscreen"'
    );
    expect(frame).toContain('allowFullScreen=""');
    expect(frame).toContain('referrerPolicy="strict-origin-when-cross-origin"');
    expect(frame).toContain('loading="lazy"');
    expect(frame).toContain("aspect-video");
    expect(frame).not.toContain("sandbox");
  });

  it("is not drawn for a Bunny link the tab will not frame", async () => {
    expect(
      await frameOf(rec({ url: SIGNED.replace("https:", "http:") }))
    ).toEqual([]);
  });

  it("is YouTube's as it was for a YouTube recording", async () => {
    const [frame] = await frameOf(
      rec({ provider: "YOUTUBE", url: "https://youtu.be/muhtelife001" })
    );
    expect(frame).toContain(
      'src="https://www.youtube-nocookie.com/embed/muhtelife001"'
    );
    expect(frame).toContain('title="Emsile-i muhtelife"');
    expect(frame).toContain(
      'sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"'
    );
    expect(frame).not.toContain("autoplay");
  });
});
