import { resources } from "@medaris/i18n";
import type { RecordingResponse } from "@medaris/services/tedrisat";
import { describe, expect, it } from "vitest";
import {
  bunnyPlayerUrlOf,
  embedUrlOf,
  groupByWeek,
  isPlainWeekTitle,
  liveChatPopoutUrlOf,
  liveChatUrlOf,
  liveEmbedUrlOf,
  playerApiUrlOf,
  type ReleaseTranslate,
  recordingAction,
  recordingReleaseOf,
  recordingsTabPath,
  releaseWordsOf,
} from "~/features/courses/recordings-model";

// A player link as tedrisat signs it (MDRS-119): library, video GUID, token, expiry.
const VIDEO = "3f1c2b4a-5d6e-4f70-8a9b-0c1d2e3f4a5b";
const TOKEN =
  "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08";
const PLAYER = `https://player.mediadelivery.net/embed/424242/${VIDEO}`;
const SIGNED = `${PLAYER}?token=${TOKEN}&expires=1790000000`;

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

describe("bunnyPlayerUrlOf (MDRS-114)", () => {
  it.each([
    ["the form tedrisat signs", SIGNED],
    [
      "the two keys the other way round",
      `${PLAYER}?expires=1790000000&token=${TOKEN}`,
    ],
    [
      "a video GUID in capitals, as a pasted link may carry it",
      `https://player.mediadelivery.net/embed/424242/${VIDEO.toUpperCase()}?token=${TOKEN}&expires=1790000000`,
    ],
  ])("frames %s, as the very string the API returned", (_label, url) => {
    expect(bunnyPlayerUrlOf(url)).toBe(url);
    expect(embedUrlOf("BUNNY", url)).toBe(url);
  });

  it.each([
    [
      "another host",
      SIGNED.replace("player.mediadelivery.net", "evil.example"),
    ],
    ["Bunny's older iframe host", SIGNED.replace("player.", "iframe.")],
    [
      "Bunny's direct-play host",
      SIGNED.replace("player.mediadelivery.net", "video.bunnycdn.com"),
    ],
    [
      "a look-alike subdomain",
      SIGNED.replace(
        "player.mediadelivery.net",
        "player.mediadelivery.net.evil.example"
      ),
    ],
    [
      "a host ending in the player's name",
      SIGNED.replace("player.", "xplayer."),
    ],
    [
      "the host with a trailing dot",
      SIGNED.replace("mediadelivery.net", "mediadelivery.net."),
    ],
    [
      "the host in capitals",
      SIGNED.replace("player.mediadelivery.net", "PLAYER.mediadelivery.net"),
    ],
    ["http", SIGNED.replace("https:", "http:")],
    ["another port", SIGNED.replace(".net/", ".net:8443/")],
    ["the default port written out", SIGNED.replace(".net/", ".net:443/")],
    [
      "a user name and password",
      SIGNED.replace("https://", "https://user:pass@"),
    ],
    ["a user name", SIGNED.replace("https://", "https://user@")],
    ["a fragment", `${SIGNED}#t=30`],
    ["an empty fragment", `${SIGNED}#`],
    ["an extra query key", `${SIGNED}&autoplay=true`],
    ["a second token", `${SIGNED}&token=${TOKEN}`],
    ["a trailing ampersand", `${SIGNED}&`],
    ["no signature", PLAYER],
    ["a token with no expiry", `${PLAYER}?token=${TOKEN}`],
    ["an expiry with no token", `${PLAYER}?expires=1790000000`],
    [
      "a token that is not a SHA-256 hex",
      `${PLAYER}?token=${TOKEN.slice(1)}&expires=1790000000`,
    ],
    [
      "a token in capitals",
      `${PLAYER}?token=${TOKEN.toUpperCase()}&expires=1790000000`,
    ],
    ["an expiry that is not a number", `${PLAYER}?token=${TOKEN}&expires=soon`],
    ["the play path", SIGNED.replace("/embed/", "/play/")],
    ["a path below the video", SIGNED.replace(VIDEO, `${VIDEO}/extra`)],
    ["a library that is not a number", SIGNED.replace("424242", "lib")],
    ["a video that is not a GUID", SIGNED.replace(VIDEO, "not-a-guid")],
    ["no video", SIGNED.replace(`/${VIDEO}`, "")],
    [
      "a path the parser rewrites",
      SIGNED.replace("/embed/424242/", "/embed/1/../424242/"),
    ],
    ["leading white space", ` ${SIGNED}`],
    ["a script address", "javascript:alert(1)"],
    ["not a link", "not a url"],
  ])("does not frame %s", (_label, url) => {
    expect(bunnyPlayerUrlOf(url)).toBeNull();
    expect(embedUrlOf("BUNNY", url)).toBeNull();
  });

  it("frames nothing for no link", () => {
    expect(bunnyPlayerUrlOf(null)).toBeNull();
    expect(bunnyPlayerUrlOf(undefined)).toBeNull();
    expect(bunnyPlayerUrlOf("")).toBeNull();
  });

  it.each([
    "YOUTUBE",
    "DRIVE",
    "OTHER",
  ])("does not frame a Bunny-looking link stored as %s", (provider) => {
    expect(embedUrlOf(provider, SIGNED)).toBeNull();
  });

  it("leaves the signed link as it is for the notes panel: no player API", () => {
    expect(playerApiUrlOf(embedUrlOf("BUNNY", SIGNED))).toBe(SIGNED);
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

describe("liveChatPopoutUrlOf", () => {
  it("is YouTube's own chat page for the video, with no embedding host", () => {
    for (const link of [
      "https://www.youtube.com/live/ybHyHDBiRoE?si=x",
      "https://youtu.be/ybHyHDBiRoE",
      "https://www.youtube.com/watch?v=ybHyHDBiRoE",
    ]) {
      const url = new URL(liveChatPopoutUrlOf(link) ?? "");
      expect(url.origin + url.pathname, link).toBe(
        "https://www.youtube.com/live_chat"
      );
      expect(url.searchParams.get("is_popout"), link).toBe("1");
      expect(url.searchParams.get("v"), link).toBe("ybHyHDBiRoE");
      expect(url.searchParams.has("embed_domain"), link).toBe(false);
    }
  });

  it("is nothing for a link without a video id, another host, or none", () => {
    expect(
      liveChatPopoutUrlOf("https://www.youtube.com/@medaris/live")
    ).toBeNull();
    expect(
      liveChatPopoutUrlOf("https://example.org/live/ybHyHDBiRoE")
    ).toBeNull();
    expect(liveChatPopoutUrlOf(null)).toBeNull();
  });
});

describe("recordingAction (tedris/24, MDRS-285)", () => {
  const drive = rec("a", {
    provider: "DRIVE",
    url: "https://drive.google.com/file/d/abcdef123/view",
  });
  const bunny = rec("a", { provider: "BUNNY", url: SIGNED });
  const other = rec("a", { provider: "OTHER", url: "https://example.org/k" });

  it.each([
    ["YouTube", rec("a")],
    ["Bunny", bunny],
    ["Drive", drive],
    ["another host", other],
    [
      "a YouTube link that cannot be framed",
      rec("a", { url: "https://www.youtube.com/@kanal" }),
    ],
  ])("opens the watch page for a ready %s recording, to a viewer who may read the content", (_label, recording) => {
    expect(recordingAction(recording, true)).toBe("watch");
  });

  it.each([
    ["YouTube", rec("a", { visibility: "PUBLIC" })],
    ["Bunny", { ...bunny, visibility: "PUBLIC" } as RecordingResponse],
    ["Drive", drive],
  ])("opens a ready %s recording at its host for a viewer who may not, whom the watch page would turn away", (_label, recording) => {
    expect(recordingAction(recording, false)).toBe("open");
  });

  it.each([
    true,
    false,
  ])("offers nothing for a recording being prepared (watch: %s)", (watch) => {
    expect(
      recordingAction(rec("a", { status: "PROCESSING", url: null }), watch)
    ).toBe("none");
    expect(
      recordingAction(
        rec("a", { provider: "BUNNY", status: "PROCESSING", url: null }),
        watch
      )
    ).toBe("none");
    expect(recordingAction(rec("a", { url: null }), watch)).toBe("none");
  });
});

describe("groupByWeek", () => {
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
});

describe("isPlainWeekTitle (MDRS-280)", () => {
  it.each([
    ["Hafta 3", 3],
    ["hafta 3", 3],
    ["HAFTA 03", 3],
    ["  Hafta   3 ", 3],
    ["Hafta3", 3],
    ["3. hafta", 3],
    ["3 Hafta", 3],
    ["Week 3", 3],
    ["الأسبوع 3", 3],
    ["", 3],
  ])("takes %j as only naming week %i", (title, n) => {
    expect(isPlainWeekTitle(title, n)).toBe(true);
  });

  it.each([
    ["Hafta 3", 4],
    ["Hafta 13", 3],
    ["Hafta 3: Mezîd fiiller", 3],
    ["Mezîd fiiller", 3],
    ["İkinci hafta", 2],
  ])("keeps %j as a title of week %i", (title, n) => {
    expect(isPlainWeekTitle(title, n)).toBe(false);
  });
});

describe("recordingsTabPath", () => {
  it("is the course page's recordings tab", () => {
    expect(recordingsTabPath("c1")).toBe("/courses/c1?tab=kayitlar");
  });
});

describe("recordingReleaseOf (MDRS-288)", () => {
  const NOW = new Date("2026-10-03T17:52:00.000Z");
  const AT = new Date("2026-10-14T17:00:00.000Z");

  it("holds a recording the API sent without its link until its time: a talebe or a visitor", () => {
    expect(
      recordingReleaseOf(rec("a", { url: null, availableAt: AT }), NOW)
    ).toEqual({ kind: "held", at: AT });
  });

  it("marks the course team's early play: the link came with a time still ahead", () => {
    expect(recordingReleaseOf(rec("a", { availableAt: AT }), NOW)).toEqual({
      kind: "early",
      at: AT,
    });
  });

  it("reads a recording still being prepared, with a time ahead, as held", () => {
    expect(
      recordingReleaseOf(
        rec("a", { status: "PROCESSING", url: null, availableAt: AT }),
        NOW
      )
    ).toEqual({ kind: "held", at: AT });
  });

  it("has nothing to say once the time has come, or with no time ('Hazır olunca hemen')", () => {
    expect(recordingReleaseOf(rec("a", { availableAt: AT }), AT)).toBeNull();
    expect(
      recordingReleaseOf(
        rec("a", { availableAt: new Date(NOW.getTime() - 60_000) }),
        NOW
      )
    ).toBeNull();
    expect(recordingReleaseOf(rec("a", { availableAt: null }), NOW)).toBeNull();
    expect(recordingReleaseOf(rec("a"), NOW)).toBeNull();
    expect(recordingReleaseOf(null, NOW)).toBeNull();
  });

  it("takes the time as a string too, as a body crosses to the browser", () => {
    expect(
      recordingReleaseOf(
        { status: "READY", url: null, availableAt: AT.toISOString() },
        NOW
      )
    ).toEqual({ kind: "held", at: AT });
  });
});

describe("releaseWordsOf (MDRS-288)", () => {
  const translator =
    (locale: "tr" | "en" | "ar"): ReleaseTranslate =>
    (key, values) =>
      resources[locale].tedrisLearn.RecordingRelease[key].replace(
        /\{(\w+)\}/g,
        (_, name: string) => values[name] ?? ""
      );
  const ISTANBUL = "Europe/Istanbul";
  const words = (
    at: string,
    kind: "held" | "early",
    {
      locale = "tr",
      viewer = ISTANBUL,
    }: { locale?: "tr" | "en" | "ar"; viewer?: string } = {}
  ) =>
    releaseWordsOf({ kind, at: new Date(at) }, translator(locale), {
      locale,
      courseTimeZone: ISTANBUL,
      viewerTimeZone: viewer,
    });

  it("tells a talebe the day and the clock in the course's zone, the Turkish clock in the locative", () => {
    expect(words("2026-10-14T17:00:00Z", "held")).toEqual({
      text: "Ders kaydı 14 Ekim Çarşamba 20:00’de açılır.",
      zone: null,
    });
    expect(words("2026-10-14T11:15:00Z", "held").text).toBe(
      "Ders kaydı 14 Ekim Çarşamba 14:15’te açılır."
    );
    expect(words("2026-10-14T16:30:00Z", "held").text).toBe(
      "Ders kaydı 14 Ekim Çarşamba 19:30’da açılır."
    );
  });

  it("tells the course team when talebe may watch what they play now", () => {
    expect(words("2026-10-14T17:00:00Z", "early").text).toBe(
      "Talebelere 14 Ekim Çarşamba 20:00’de açılacak"
    );
  });

  it("names the course's zone and gives the viewer's clock when it shows another time", () => {
    expect(
      words("2026-10-14T17:00:00Z", "held", { viewer: "Europe/Berlin" })
    ).toEqual({
      text: "Ders kaydı 14 Ekim Çarşamba 20:00’de açılır.",
      zone: "İstanbul saatiyle · 19:00 senin saatinle",
    });
  });

  it("gives the viewer's weekday when their clock falls on another day", () => {
    expect(
      words("2026-10-14T03:30:00Z", "held", { viewer: "America/New_York" }).zone
    ).toBe("İstanbul saatiyle · Sal 23:30 senin saatinle");
  });

  it("is worded in English and Arabic", () => {
    expect(words("2026-10-14T17:00:00Z", "held", { locale: "en" }).text).toBe(
      "The recording opens on Wednesday, October 14 at 08:00 PM."
    );
    expect(
      words("2026-10-14T17:00:00Z", "early", {
        locale: "en",
        viewer: "Europe/Berlin",
      })
    ).toEqual({
      text: "Opens to talebe on Wednesday, October 14 at 08:00 PM",
      zone: "Istanbul time · 07:00 PM your time",
    });
    // The digits are left to the runtime's Arabic numbering.
    expect(
      words("2026-10-14T17:00:00Z", "held", { locale: "ar" }).text
    ).toMatch(/^يُتاح التسجيل يوم الأربعاء، .+ أكتوبر الساعة .+\.$/);
  });
});
