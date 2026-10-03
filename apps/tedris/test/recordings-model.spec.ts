import type { RecordingResponse } from "@medaris/services/tedrisat";
import { describe, expect, it } from "vitest";
import {
  embedUrlOf,
  firstPlayable,
  groupByWeek,
  liveChatUrlOf,
  liveEmbedUrlOf,
  recordingAction,
  recordingsTabPath,
} from "~/features/courses/recordings-model";

const rec = (
  id: string,
  over: Partial<RecordingResponse> = {}
): RecordingResponse =>
  ({
    id,
    lessonId: `l-${id}`,
    weekId: "w1",
    weekNumber: 1,
    weekTitle: "Hafta",
    title: id,
    recordedAt: new Date("2026-09-05T18:00:00Z"),
    durationMinutes: 47,
    provider: "YOUTUBE",
    url: `https://youtu.be/${id}abcdef`,
    visibility: "ENROLLED",
    status: "READY",
    ...over,
  }) as RecordingResponse;

describe("embedUrlOf (MDRS-162)", () => {
  it.each([
    "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    "https://youtube.com/watch?v=dQw4w9WgXcQ&t=30s",
    "https://m.youtube.com/watch?v=dQw4w9WgXcQ",
    "https://youtu.be/dQw4w9WgXcQ?si=abc",
    "https://www.youtube.com/live/dQw4w9WgXcQ",
    "https://www.youtube.com/embed/dQw4w9WgXcQ",
    "https://www.youtube.com/shorts/dQw4w9WgXcQ",
  ])("frames a YouTube link by its video id: %s", (url) => {
    expect(embedUrlOf("YOUTUBE", url)).toBe(
      "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"
    );
  });

  it("frames a Drive file through its preview, never the stored link", () => {
    expect(
      embedUrlOf(
        "DRIVE",
        "https://drive.google.com/file/d/1AbC-dEf_G23/view?usp=sharing"
      )
    ).toBe("https://drive.google.com/file/d/1AbC-dEf_G23/preview");
  });

  it.each([
    ["YOUTUBE", "http://www.youtube.com/watch?v=dQw4w9WgXcQ"],
    ["YOUTUBE", "https://evil.example/watch?v=dQw4w9WgXcQ"],
    ["YOUTUBE", "https://youtube.com.evil.example/watch?v=dQw4w9WgXcQ"],
    ["YOUTUBE", "https://www.youtube.com/watch?v=<script>"],
    ["YOUTUBE", "https://www.youtube.com/channel/UCxyz"],
    ["YOUTUBE", "javascript:alert(1)"],
    ["YOUTUBE", "not a url"],
    ["DRIVE", "https://drive.google.com/drive/folders/abc"],
    ["DRIVE", "https://docs.google.com/file/d/abcdef123/view"],
    ["OTHER", "https://www.youtube.com/watch?v=dQw4w9WgXcQ"],
  ])("does not frame %s %s", (provider, url) => {
    expect(embedUrlOf(provider, url)).toBeNull();
  });

  it("frames nothing for no link", () => {
    expect(embedUrlOf("YOUTUBE", null)).toBeNull();
    expect(embedUrlOf("YOUTUBE", undefined)).toBeNull();
    expect(liveEmbedUrlOf(null)).toBeNull();
  });

  it("frames a live stream like a YouTube recording", () => {
    expect(liveEmbedUrlOf("https://www.youtube.com/watch?v=live123abc")).toBe(
      "https://www.youtube-nocookie.com/embed/live123abc"
    );
  });
});

describe("liveChatUrlOf (MDRS-229)", () => {
  const opts = { host: "tedris.medaris.app", dark: false };

  it("builds YouTube's chat from the video id, for this page's host", () => {
    const url = new URL(
      liveChatUrlOf("https://www.youtube.com/live/ybHyHDBiRoE?si=x", opts) ?? ""
    );
    expect(url.origin + url.pathname).toBe("https://www.youtube.com/live_chat");
    expect(url.searchParams.get("v")).toBe("ybHyHDBiRoE");
    expect(url.searchParams.get("embed_domain")).toBe("tedris.medaris.app");
    expect(url.searchParams.has("si")).toBe(false);
    expect(url.searchParams.has("dark_theme")).toBe(false);
  });

  it("asks for the dark chat on a dark page", () => {
    const url = liveChatUrlOf("https://youtu.be/ybHyHDBiRoE", {
      ...opts,
      dark: true,
    });
    expect(new URL(url ?? "").searchParams.get("dark_theme")).toBe("1");
  });

  it("accepts every link the player accepts", () => {
    for (const link of [
      "https://www.youtube.com/watch?v=ybHyHDBiRoE",
      "https://m.youtube.com/live/ybHyHDBiRoE",
      "https://www.youtube.com/embed/ybHyHDBiRoE",
      "https://youtu.be/ybHyHDBiRoE",
    ]) {
      expect(liveChatUrlOf(link, opts), link).toContain("v=ybHyHDBiRoE");
    }
  });

  it("gives no chat for a link without a video id, another host, or no host", () => {
    expect(
      liveChatUrlOf("https://www.youtube.com/@medaris/live", opts)
    ).toBeNull();
    expect(
      liveChatUrlOf("https://example.org/live/ybHyHDBiRoE", opts)
    ).toBeNull();
    expect(
      liveChatUrlOf("http://www.youtube.com/live/ybHyHDBiRoE", opts)
    ).toBeNull();
    expect(liveChatUrlOf(null, opts)).toBeNull();
    expect(
      liveChatUrlOf("https://youtu.be/ybHyHDBiRoE", { host: "", dark: false })
    ).toBeNull();
  });
});

describe("recordingAction (tedris/24 criteria 3 and 4)", () => {
  it("plays a ready YouTube recording in the page's player", () => {
    expect(recordingAction(rec("a"))).toBe("play");
  });

  it("opens a Drive recording at its host", () => {
    expect(
      recordingAction(
        rec("a", {
          provider: "DRIVE",
          url: "https://drive.google.com/file/d/abcdef123/view",
        })
      )
    ).toBe("open");
  });

  it("opens a YouTube link it cannot frame instead of playing it", () => {
    expect(
      recordingAction(rec("a", { url: "https://www.youtube.com/@kanal" }))
    ).toBe("open");
  });

  it("offers nothing for a recording being prepared", () => {
    expect(recordingAction(rec("a", { status: "PROCESSING", url: null }))).toBe(
      "none"
    );
    expect(recordingAction(rec("a", { url: null }))).toBe("none");
  });
});

describe("groupByWeek and firstPlayable", () => {
  const list = [
    rec("d", { weekId: "w4", weekNumber: 4, status: "PROCESSING", url: null }),
    rec("c", { weekId: "w4", weekNumber: 4 }),
    rec("b", {
      weekId: "w3",
      weekNumber: 3,
      provider: "DRIVE",
      url: "https://drive.google.com/file/d/abcdef123/view",
    }),
    rec("a", { weekId: "w1", weekNumber: 1 }),
  ];

  it("groups by week in the order the API sent", () => {
    const groups = groupByWeek(list);
    expect(groups.map((g) => [g.weekNumber, g.items.map((i) => i.id)])).toEqual(
      [
        [4, ["d", "c"]],
        [3, ["b"]],
        [1, ["a"]],
      ]
    );
  });

  it("starts the player on the newest recording that plays in it", () => {
    expect(firstPlayable(list)?.id).toBe("c");
    expect(firstPlayable([list[0], list[2]])).toBeNull();
    expect(firstPlayable([])).toBeNull();
  });
});

describe("recordingsTabPath", () => {
  it("is the course page's recordings tab", () => {
    expect(recordingsTabPath("c1")).toBe("/courses/c1?tab=kayitlar");
  });
});
