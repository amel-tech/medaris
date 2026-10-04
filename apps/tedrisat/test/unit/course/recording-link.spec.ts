import { RecordingProvider } from "../../../src/course/domain/recording";
import {
  detectRecordingLink,
  RECORDING_LINK_MAX_LENGTH,
  type RecordingLinkProblem,
} from "../../../src/course/domain/recording-link";
import { RecordingLinkInvalidError } from "../../../src/course/errors/recording-link-invalid.error";

const LIBRARY = "424242";
const VIDEO = "b1190000-0000-4000-8000-000000000001";

/** The problem `detectRecordingLink` refuses `url` with, or null when it accepts it. */
const problemOf = (
  url: string,
  library: string | null = LIBRARY
): RecordingLinkProblem | null => {
  try {
    detectRecordingLink(url, library);
    return null;
  } catch (error) {
    expect(error).toBeInstanceOf(RecordingLinkInvalidError);
    expect((error as RecordingLinkInvalidError).status).toBe(400);
    return (error as RecordingLinkInvalidError).reason;
  }
};

describe("detectRecordingLink: YouTube (MDRS-119)", () => {
  it.each([
    ["https://www.youtube.com/watch?v=dQw4w9WgXcQ"],
    ["https://youtube.com/watch?v=dQw4w9WgXcQ&t=42s&si=tracking"],
    ["https://m.youtube.com/watch?v=dQw4w9WgXcQ"],
    ["https://youtu.be/dQw4w9WgXcQ"],
    ["https://youtu.be/dQw4w9WgXcQ?si=tracking"],
    ["https://www.youtube.com/live/dQw4w9WgXcQ"],
    ["https://www.youtube.com/live/dQw4w9WgXcQ?feature=share"],
    ["https://www.youtube.com/shorts/dQw4w9WgXcQ"],
    ["https://youtube.com/shorts/dQw4w9WgXcQ"],
    ["https://www.youtube.com/embed/dQw4w9WgXcQ"],
    ["https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"],
    ["  https://youtu.be/dQw4w9WgXcQ  "],
    ["https://www.youtube.com./watch?v=dQw4w9WgXcQ"],
  ])("reads the video id of %s and stores the watch link", (url) => {
    expect(detectRecordingLink(url, LIBRARY)).toEqual({
      provider: RecordingProvider.YOUTUBE,
      url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      youtubeVideoId: "dQw4w9WgXcQ",
    });
  });

  it("is YouTube without a library configured: only Bunny needs one", () => {
    expect(
      detectRecordingLink("https://youtu.be/dQw4w9WgXcQ", null).provider
    ).toBe(RecordingProvider.YOUTUBE);
  });

  it.each([
    ["https://www.youtube.com/"],
    ["https://www.youtube.com/watch"],
    ["https://www.youtube.com/watch?list=PL123"],
    ["https://www.youtube.com/@medaris"],
    ["https://www.youtube.com/@medaris/live"],
    ["https://www.youtube.com/channel/UC1234567890"],
    ["https://www.youtube.com/playlist?list=PL1234567"],
    ["https://www.youtube.com/live/"],
    ["https://www.youtube.com/shorts/abc"],
    ["https://youtu.be/"],
    ["https://www.youtube.com/watch?v=<script>"],
  ])("refuses %s, which names no video", (url) => {
    expect(problemOf(url)).toBe("youtube-no-video");
  });

  it("does not take a look-alike host for YouTube", () => {
    expect(
      detectRecordingLink("https://notyoutube.com/watch?v=dQw4w9WgXcQ", LIBRARY)
    ).toMatchObject({ provider: RecordingProvider.OTHER });
    expect(
      detectRecordingLink(
        "https://youtube.com.example.org/watch?v=dQw4w9WgXcQ",
        LIBRARY
      )
    ).toMatchObject({ provider: RecordingProvider.OTHER });
  });
});

describe("detectRecordingLink: Bunny (MDRS-119)", () => {
  it.each([
    [`https://player.mediadelivery.net/embed/${LIBRARY}/${VIDEO}`],
    [`https://player.mediadelivery.net/play/${LIBRARY}/${VIDEO}`],
    [`https://iframe.mediadelivery.net/embed/${LIBRARY}/${VIDEO}`],
    [
      `https://player.mediadelivery.net/embed/${LIBRARY}/${VIDEO}?autoplay=true&token=abc&expires=1`,
    ],
    [`https://player.mediadelivery.net/embed/${LIBRARY}/${VIDEO}/`],
    [
      `https://player.mediadelivery.net/embed/${LIBRARY}/${VIDEO.toUpperCase()}`,
    ],
  ])("stores only the video id of %s, never the link", (url) => {
    const detected = detectRecordingLink(url, LIBRARY);
    expect(detected).toEqual({
      provider: RecordingProvider.BUNNY,
      bunnyVideoId: VIDEO,
    });
    expect(JSON.stringify(detected)).not.toContain("mediadelivery");
    expect(JSON.stringify(detected)).not.toContain("token");
  });

  it("refuses a link of another library", () => {
    expect(
      problemOf(`https://player.mediadelivery.net/embed/999999/${VIDEO}`)
    ).toBe("bunny-foreign-library");
    // A library id that only starts or ends like ours is another library.
    expect(
      problemOf(`https://player.mediadelivery.net/embed/4242420/${VIDEO}`)
    ).toBe("bunny-foreign-library");
    expect(
      problemOf(`https://player.mediadelivery.net/embed/42424/${VIDEO}`)
    ).toBe("bunny-foreign-library");
  });

  it("refuses every Bunny link while no library is configured", () => {
    expect(
      problemOf(
        `https://player.mediadelivery.net/embed/${LIBRARY}/${VIDEO}`,
        null
      )
    ).toBe("bunny-foreign-library");
  });

  it.each([
    [`https://player.mediadelivery.net/embed/${LIBRARY}`],
    [`https://player.mediadelivery.net/embed/${LIBRARY}/not-a-guid`],
    [`https://player.mediadelivery.net/embed/lib/${VIDEO}`],
    [`https://player.mediadelivery.net/watch/${LIBRARY}/${VIDEO}`],
    [`https://player.mediadelivery.net/embed/${LIBRARY}/${VIDEO}/extra`],
    ["https://player.mediadelivery.net/"],
  ])("refuses %s, which names no video", (url) => {
    expect(problemOf(url)).toBe("bunny-no-video");
  });

  it.each([
    [`https://player.mediadelivery.net./embed/${LIBRARY}/${VIDEO}`],
    [`https://iframe.mediadelivery.net./embed/${LIBRARY}/${VIDEO}`],
    [`https://PLAYER.mediadelivery.net../embed/${LIBRARY}/${VIDEO}`],
    [`https://video.bunnycdn.com/play/${LIBRARY}/${VIDEO}`],
  ])("reads %s as a Bunny player link", (url) => {
    expect(detectRecordingLink(url, LIBRARY)).toEqual({
      provider: RecordingProvider.BUNNY,
      bunnyVideoId: VIDEO,
    });
  });

  it.each([
    [`https://player.mediadelivery.net./embed/999999/${VIDEO}`],
    [`https://iframe.mediadelivery.net./embed/999999/${VIDEO}`],
    [`https://video.bunnycdn.com./play/999999/${VIDEO}`],
  ])("refuses %s, another library behind a trailing dot", (url) => {
    expect(problemOf(url)).toBe("bunny-foreign-library");
  });

  it.each([
    [`https://vz-abc123.b-cdn.net/${VIDEO}/playlist.m3u8`],
    [`https://vz-abc123.b-cdn.net./${VIDEO}/play_720p.mp4`],
    [`https://video.mediadelivery.net/embed/999999/${VIDEO}`],
    [`https://mediadelivery.net/embed/${LIBRARY}/${VIDEO}`],
    [`https://iframe.bunnycdn.com/embed/999999/${VIDEO}`],
  ])("refuses %s, a Bunny host that is not a player, rather than keep it as OTHER", (url) => {
    expect(problemOf(url)).toBe("bunny-no-video");
  });

  it("does not take a look-alike host for Bunny", () => {
    expect(
      detectRecordingLink(
        `https://player.mediadelivery.net.example.org/embed/${LIBRARY}/${VIDEO}`,
        LIBRARY
      )
    ).toMatchObject({ provider: RecordingProvider.OTHER });
  });
});

describe("detectRecordingLink: other links (MDRS-119)", () => {
  it("reads Google Drive and Docs as DRIVE and keeps the link", () => {
    for (const url of [
      "https://drive.google.com/file/d/1AbC/view",
      "https://docs.google.com/document/d/1AbC",
    ]) {
      expect(detectRecordingLink(url, LIBRARY)).toEqual({
        provider: RecordingProvider.DRIVE,
        url,
      });
    }
  });

  it("reads any other https link as OTHER and keeps it as pasted", () => {
    for (const url of [
      "https://us02web.zoom.us/rec/share/abc",
      "https://meet.google.com/abc-defg-hij",
      "https://vimeo.com/123",
    ]) {
      expect(detectRecordingLink(`  ${url} `, LIBRARY)).toEqual({
        provider: RecordingProvider.OTHER,
        url,
      });
    }
  });

  it.each([
    ["http://www.youtube.com/watch?v=dQw4w9WgXcQ", "not-https"],
    [`http://player.mediadelivery.net/embed/${LIBRARY}/${VIDEO}`, "not-https"],
    ["javascript:alert(1)", "not-https"],
    ["ftp://example.org/x", "not-https"],
    ["not a link", "invalid"],
    ["", "invalid"],
    ["   ", "invalid"],
    ["https://user:secret@example.org/rec", "invalid"],
    [`https://example.org/${"a".repeat(RECORDING_LINK_MAX_LENGTH)}`, "invalid"],
  ])("refuses %s (%s)", (url, problem) => {
    expect(problemOf(url)).toBe(problem);
  });

  it("names the reason in the error, for nazir to word", () => {
    try {
      detectRecordingLink(
        `https://player.mediadelivery.net/embed/1/${VIDEO}`,
        LIBRARY
      );
      expect.unreachable();
    } catch (error) {
      expect(error).toMatchObject({
        code: "RECORDING_LINK_INVALID",
        reason: "bunny-foreign-library",
      });
    }
  });
});
