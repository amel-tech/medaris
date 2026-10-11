import {
  type IRecordingRow,
  LIVE_STREAM_HOURS_AFTER_END,
  liveStreamFor,
  RecordingProvider,
  RecordingStatus,
  RecordingVisibility,
  visibleRecordings,
} from "../../../src/course/domain/recording";
import { DEFAULT_SESSION_MINUTES } from "../../../src/course/domain/session-view";

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

describe("liveStreamFor (MDRS-162, MDRS-285)", () => {
  const url = "https://youtube.com/live/abc";
  const START = new Date("2026-10-11T17:00:00.000Z");
  const HOUR = 3_600_000;
  const at = (hours: number) => new Date(START.getTime() + hours * HOUR);
  // A 90-minute celse: its scheduled end is at 1.5 hours.
  const celse = {
    scheduledAt: START,
    durationMinutes: 90,
    cancelledAt: null as Date | null,
  };
  const stream = (
    now: Date,
    recording: RecordingStatus | null = null,
    over: Partial<typeof celse> = {}
  ) => liveStreamFor({ ...celse, ...over }, url, recording, true, now);

  it("is null before the scheduled start", () => {
    expect(stream(at(-0.01))).toBeNull();
    expect(stream(at(-24))).toBeNull();
  });

  it("gives the stream from the start and while the clock says LIVE", () => {
    expect(stream(START)).toBe(url);
    expect(stream(at(1))).toBe(url);
  });

  it("keeps giving it after the scheduled end while there is no recording", () => {
    expect(stream(at(1.5))).toBe(url);
    expect(stream(at(3))).toBe(url);
    expect(stream(at(20))).toBe(url);
  });

  it("keeps giving it while the recording is PROCESSING or FAILED", () => {
    for (const status of [RecordingStatus.PROCESSING, RecordingStatus.FAILED]) {
      expect(stream(at(1), status)).toBe(url);
      expect(stream(at(3), status)).toBe(url);
    }
  });

  it("stops once the session has a READY recording, even while the clock says LIVE", () => {
    expect(stream(at(3), RecordingStatus.READY)).toBeNull();
    expect(stream(at(1), RecordingStatus.READY)).toBeNull();
  });

  it("stops LIVE_STREAM_HOURS_AFTER_END hours after the scheduled end with no recording", () => {
    expect(LIVE_STREAM_HOURS_AFTER_END).toBe(24);
    const cap = 1.5 + LIVE_STREAM_HOURS_AFTER_END;
    expect(stream(new Date(at(cap).getTime() - 1))).toBe(url);
    expect(stream(at(cap))).toBeNull();
    expect(stream(at(cap + 24))).toBeNull();
    expect(stream(at(cap), RecordingStatus.PROCESSING)).toBeNull();
  });

  it("counts the default hour for a session with no length", () => {
    const cap = 1 + LIVE_STREAM_HOURS_AFTER_END;
    expect(DEFAULT_SESSION_MINUTES).toBe(60);
    expect(
      stream(new Date(at(cap).getTime() - 1), null, { durationMinutes: null })
    ).toBe(url);
    expect(stream(at(cap), null, { durationMinutes: null })).toBeNull();
  });

  it("is null for a cancelled session and for one with no time", () => {
    expect(stream(at(1), null, { cancelledAt: at(-48) })).toBeNull();
    expect(stream(at(1), null, { scheduledAt: null })).toBeNull();
  });

  it("gives it to nobody who may not read content", () => {
    expect(liveStreamFor(celse, url, null, false, at(1))).toBeNull();
    expect(liveStreamFor(celse, url, null, false, at(3))).toBeNull();
  });

  it("is null when none was set", () => {
    expect(liveStreamFor(celse, null, null, true, at(1))).toBeNull();
    expect(liveStreamFor(celse, null, null, true, at(3))).toBeNull();
  });
});
