import {
  applyRecordingPatch,
  type IRecordingRow,
  liveStreamFor,
  providerOfUrl,
  RecordingProvider,
  RecordingStatus,
  RecordingVisibility,
  visibleRecordings,
} from "../../../src/course/domain/recording";
import { SessionStatus } from "../../../src/course/domain/session-status.enum";
import { RecordingYoutubePublicOnlyError } from "../../../src/course/errors/recording-youtube-public-only.error";

const row = (id: string, over: Partial<IRecordingRow> = {}): IRecordingRow => ({
  id,
  lessonId: `lesson-${id}`,
  weekId: `week-${id}`,
  weekNumber: 1,
  weekTitle: "Hafta",
  title: `Kayıt ${id}`,
  recordedAt: new Date("2026-09-05T18:00:00Z"),
  durationMinutes: 47,
  provider: RecordingProvider.YOUTUBE,
  url: `https://youtu.be/${id}`,
  visibility: RecordingVisibility.ENROLLED,
  status: RecordingStatus.READY,
  ...over,
});

describe("visibleRecordings (MDRS-162)", () => {
  it("orders by week descending, then by recording date descending", () => {
    const list = visibleRecordings(
      [
        row("a", { weekNumber: 1 }),
        row("b", {
          weekNumber: 4,
          recordedAt: new Date("2026-09-26T18:00:00Z"),
        }),
        row("c", {
          weekNumber: 4,
          recordedAt: new Date("2026-09-27T18:00:00Z"),
        }),
        row("d", { weekNumber: 3 }),
      ],
      true
    );
    expect(list.map((r) => r.id)).toEqual(["c", "b", "d", "a"]);
  });

  it("lists everything for a caller who may read content", () => {
    const list = visibleRecordings(
      [row("a"), row("b", { visibility: RecordingVisibility.PUBLIC })],
      true
    );
    expect(list).toHaveLength(2);
  });

  it("lists only PUBLIC recordings for everyone else", () => {
    const list = visibleRecordings(
      [row("a"), row("b", { visibility: RecordingVisibility.PUBLIC })],
      false
    );
    expect(list.map((r) => r.id)).toEqual(["b"]);
  });

  it("lists nothing public to everyone else when the course is closed (MDRS-176)", () => {
    const rows = [
      row("a"),
      row("b", { visibility: RecordingVisibility.PUBLIC }),
    ];
    expect(visibleRecordings(rows, false, false)).toEqual([]);
    expect(visibleRecordings(rows, true, false)).toHaveLength(2);
  });

  it("lists no FAILED recording, to anyone (MDRS-116)", () => {
    const rows = [
      row("a"),
      row("b", {
        provider: RecordingProvider.BUNNY,
        url: null,
        status: RecordingStatus.FAILED,
        visibility: RecordingVisibility.PUBLIC,
      }),
    ];
    expect(visibleRecordings(rows, true).map((r) => r.id)).toEqual(["a"]);
    expect(visibleRecordings(rows, false)).toEqual([]);
  });

  it("gives a PROCESSING recording no link, even if one is stored", () => {
    const [only] = visibleRecordings(
      [row("a", { status: RecordingStatus.PROCESSING })],
      true
    );
    expect(only.url).toBeNull();
    expect(only.status).toBe(RecordingStatus.PROCESSING);
  });

  it("keeps the link of a READY recording", () => {
    const [only] = visibleRecordings([row("a")], true);
    expect(only.url).toBe("https://youtu.be/a");
  });
});

describe("liveStreamFor (MDRS-162)", () => {
  const url = "https://youtube.com/live/abc";
  it("gives the stream only while the session is LIVE", () => {
    expect(liveStreamFor(SessionStatus.LIVE, url, true)).toBe(url);
    expect(liveStreamFor(SessionStatus.SCHEDULED, url, true)).toBeNull();
    expect(liveStreamFor(SessionStatus.ENDED, url, true)).toBeNull();
    expect(liveStreamFor(SessionStatus.CANCELLED, url, true)).toBeNull();
  });

  it("gives it to nobody who may not read content", () => {
    expect(liveStreamFor(SessionStatus.LIVE, url, false)).toBeNull();
  });

  it("is null when none was set", () => {
    expect(liveStreamFor(SessionStatus.LIVE, null, true)).toBeNull();
  });
});

describe("providerOfUrl (MDRS-247)", () => {
  it.each([
    ["https://www.youtube.com/watch?v=abc", RecordingProvider.YOUTUBE],
    ["https://youtu.be/abc", RecordingProvider.YOUTUBE],
    ["https://www.youtube-nocookie.com/embed/abc", RecordingProvider.YOUTUBE],
    ["https://drive.google.com/file/d/xyz/view", RecordingProvider.DRIVE],
    ["https://docs.google.com/document/d/xyz", RecordingProvider.DRIVE],
    ["https://us02web.zoom.us/rec/share/abc", RecordingProvider.OTHER],
    ["https://meet.google.com/abc-defg-hij", RecordingProvider.OTHER],
    ["https://notyoutube.com/watch?v=abc", RecordingProvider.OTHER],
    ["https://youtube.com.example.org/x", RecordingProvider.OTHER],
    ["not a link", RecordingProvider.OTHER],
  ])("reads %s as %s", (url, provider) => {
    expect(providerOfUrl(url)).toBe(provider);
  });
});

describe("applyRecordingPatch (MDRS-247)", () => {
  const current = {
    title: "Kayıt",
    url: "https://us02web.zoom.us/rec/share/abc",
    visibility: RecordingVisibility.ENROLLED,
    provider: RecordingProvider.OTHER,
  };

  it("changes only the keys that are present", () => {
    expect(applyRecordingPatch(current, { title: "Yeni" })).toEqual({
      ...current,
      title: "Yeni",
    });
  });

  it("reads the provider again when the link changes", () => {
    expect(
      applyRecordingPatch(current, {
        url: "https://drive.google.com/file/d/xyz/view",
      })
    ).toMatchObject({ provider: RecordingProvider.DRIVE });
  });

  it("lets a YouTube link be PUBLIC and refuses it ENROLLED", () => {
    const youtube = "https://youtu.be/abc";
    expect(
      applyRecordingPatch(current, {
        url: youtube,
        visibility: RecordingVisibility.PUBLIC,
      })
    ).toMatchObject({ provider: RecordingProvider.YOUTUBE });
    expect(() => applyRecordingPatch(current, { url: youtube })).toThrow(
      RecordingYoutubePublicOnlyError
    );
  });

  it("refuses to take a YouTube recording back to ENROLLED", () => {
    const youtube = {
      ...current,
      url: "https://youtu.be/abc",
      provider: RecordingProvider.YOUTUBE,
      visibility: RecordingVisibility.PUBLIC,
    };
    expect(() =>
      applyRecordingPatch(youtube, {
        visibility: RecordingVisibility.ENROLLED,
      })
    ).toThrow(RecordingYoutubePublicOnlyError);
  });

  it("does not check a write that touches neither link nor visibility", () => {
    const older = {
      ...current,
      url: "https://youtu.be/abc",
      provider: RecordingProvider.YOUTUBE,
    };
    expect(applyRecordingPatch(older, { title: "Düzeltildi" })).toMatchObject({
      title: "Düzeltildi",
      visibility: RecordingVisibility.ENROLLED,
    });
  });
});
