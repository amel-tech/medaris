import {
  type IRecordingRow,
  liveStreamFor,
  RecordingProvider,
  RecordingStatus,
  RecordingVisibility,
  visibleRecordings,
} from "../../../src/course/domain/recording";
import { SessionStatus } from "../../../src/course/domain/session-status.enum";

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
