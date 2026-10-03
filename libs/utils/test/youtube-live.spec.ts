import {
  normalizeYoutubeLiveUrl,
  parseYoutubeLiveUrl,
} from "../src/youtube-live";

const ID = "dQw4w9WgXcQ";
const STORED = `https://www.youtube.com/live/${ID}`;

describe("parseYoutubeLiveUrl — a session's live stream link (MDRS-228)", () => {
  it.each([
    [`https://studio.youtube.com/video/${ID}/livestreaming`],
    [`https://studio.youtube.com/video/${ID}/edit`],
    [`https://studio.youtube.com/video/${ID}`],
    [`https://www.youtube.com/watch?v=${ID}`],
    [`https://youtube.com/watch?v=${ID}&t=42s`],
    [`https://m.youtube.com/watch?v=${ID}`],
    [`https://www.youtube.com/live/${ID}?si=abc`],
    [`https://youtube.com/live/${ID}`],
    [`https://www.youtube.com/embed/${ID}`],
    [`https://youtu.be/${ID}`],
    [`https://youtu.be/${ID}?si=share`],
    [`  https://www.youtube.com/watch?v=${ID}  `],
    [`HTTPS://WWW.YOUTUBE.COM/live/${ID}`],
  ])("stores %s as the /live/ link", (input) => {
    expect(parseYoutubeLiveUrl(input)).toEqual({
      ok: true,
      videoId: ID,
      url: STORED,
    });
  });

  it("reads a link typed without a scheme as https", () => {
    expect(normalizeYoutubeLiveUrl(`youtu.be/${ID}`)).toBe(STORED);
    expect(normalizeYoutubeLiveUrl(`www.youtube.com/watch?v=${ID}`)).toBe(
      STORED
    );
  });

  it.each([
    ["https://www.youtube.com/@ismailaga/live"],
    ["https://www.youtube.com/@ismailaga"],
    ["https://youtube.com/channel/UC1234567890/live"],
    ["https://www.youtube.com/c/SomeChannel/live"],
    ["https://www.youtube.com/user/someone"],
    ["https://studio.youtube.com/channel/UC1234567890/livestreaming"],
  ])("refuses the channel link %s: a video link is needed", (input) => {
    expect(parseYoutubeLiveUrl(input)).toEqual({
      ok: false,
      problem: "channel",
    });
  });

  it.each([
    ["https://vimeo.com/123456789", "not-youtube"],
    ["https://zoom.us/j/123456", "not-youtube"],
    ["https://youtube.com.evil.example/watch?v=dQw4w9WgXcQ", "not-youtube"],
    [`http://www.youtube.com/watch?v=${ID}`, "not-https"],
    [`ftp://youtu.be/${ID}`, "not-https"],
    ["https://", "invalid"],
    ["https://www.youtube.com/", "no-video"],
    ["https://www.youtube.com/watch", "no-video"],
    ["https://www.youtube.com/watch?v=", "no-video"],
    ["https://www.youtube.com/watch?v=a b", "no-video"],
    ["https://www.youtube.com/live/", "no-video"],
    ["https://www.youtube.com/results?search_query=emsile", "no-video"],
    ["https://youtu.be/", "no-video"],
    ["https://studio.youtube.com/", "no-video"],
    [`https://www.youtube.com/live/${"x".repeat(33)}`, "no-video"],
    ["", "empty"],
    ["   ", "empty"],
    [`https://youtu.be/${"a".repeat(500)}`, "too-long"],
  ])("refuses %s (%s)", (input, problem) => {
    expect(parseYoutubeLiveUrl(input)).toEqual({ ok: false, problem });
  });

  it("answers null for no input at all", () => {
    expect(parseYoutubeLiveUrl(null)).toEqual({ ok: false, problem: "empty" });
    expect(normalizeYoutubeLiveUrl(undefined)).toBeNull();
  });

  it("is idempotent: a stored link reads back as itself", () => {
    expect(normalizeYoutubeLiveUrl(STORED)).toBe(STORED);
  });
});
