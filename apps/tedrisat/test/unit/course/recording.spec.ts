import {
  type IRecordingRow,
  isReleased,
  LIVE_STREAM_HOURS_AFTER_END,
  liveStreamFor,
  mayPlay,
  RecordingProvider,
  RecordingStatus,
  RecordingVisibility,
  uploadReplaces,
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
  availableAt: null,
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

/**
 * The owner's report of 12 October: a session's stream added as its
 * recording turned out private, and its video could no longer be uploaded.
 * A link of any provider now gives way to an upload; a Bunny video only when
 * it FAILED.
 */
describe("uploadReplaces", () => {
  it("lets an upload replace a link, whatever its provider or status", () => {
    for (const provider of [
      RecordingProvider.YOUTUBE,
      RecordingProvider.DRIVE,
      RecordingProvider.OTHER,
    ]) {
      for (const status of Object.values(RecordingStatus)) {
        expect(uploadReplaces({ provider, status }), provider).toBe(true);
      }
    }
  });

  it("lets it replace a Bunny upload that FAILED, and no other Bunny video", () => {
    const bunny = (status: RecordingStatus) =>
      uploadReplaces({ provider: RecordingProvider.BUNNY, status });
    expect(bunny(RecordingStatus.FAILED)).toBe(true);
    expect(bunny(RecordingStatus.PROCESSING)).toBe(false);
    expect(bunny(RecordingStatus.READY)).toBe(false);
    // "Kayıt ekle" sends no intent, or `replaceVideo: false`: the same rule
    for (const status of [RecordingStatus.PROCESSING, RecordingStatus.READY]) {
      expect(
        uploadReplaces(
          { provider: RecordingProvider.BUNNY, status },
          { replaceVideo: false }
        ),
        status
      ).toBe(false);
    }
  });

  // 13 October: "yanlış dosya yüklemiş olsak değiştiremeyecek miyiz?" The
  // edit dialog of a Bunny recording sends `replaceVideo`; PROCESSING is in on
  // purpose, so an upload stopped with "İptal" is not stuck for 24 hours.
  it("lets an upload sent with replaceVideo replace any recording, a Bunny video in every status included", () => {
    for (const provider of Object.values(RecordingProvider)) {
      for (const status of Object.values(RecordingStatus)) {
        expect(
          uploadReplaces({ provider, status }, { replaceVideo: true }),
          `${provider} ${status}`
        ).toBe(true);
      }
    }
  });
});

/**
 * MDRS-288: the course team sets, per celse, when talebe may watch the
 * recording. Before that time a talebe or a visitor is told the recording
 * and when it opens, never its link; the course team plays it as before.
 */
describe("the release time (MDRS-288)", () => {
  const AT = new Date("2026-10-14T17:00:00.000Z");
  const before = new Date(AT.getTime() - 1);
  const talebe = (now: Date) => ({ now, team: false });
  const team = (now: Date) => ({ now, team: true });
  const held = row("a", { availableAt: AT });

  it("opens a READY recording at its time, not a moment before", () => {
    expect(isReleased(held, before)).toBe(false);
    expect(isReleased(held, AT)).toBe(true);
    expect(isReleased(held, new Date(AT.getTime() + 3_600_000))).toBe(true);
  });

  it("opens one with no time as soon as it is READY, and never one that is not", () => {
    expect(isReleased(row("a"), before)).toBe(true);
    for (const status of [RecordingStatus.PROCESSING, RecordingStatus.FAILED]) {
      expect(isReleased(row("a", { status }), AT)).toBe(false);
      expect(mayPlay(row("a", { status }), team(AT))).toBe(false);
    }
  });

  it("lists it to a talebe before the time with its availableAt and no link, and with the link at the time", () => {
    const [early] = visibleRecordings([held], true, true, talebe(before));
    expect(early).toMatchObject({ id: "a", availableAt: AT, url: null });
    expect(early.status).toBe(RecordingStatus.READY);
    const [due] = visibleRecordings([held], true, true, talebe(AT));
    expect(due.url).toBe("https://youtu.be/a");
  });

  it("gives a visitor the same for a PUBLIC recording", () => {
    const shown = row("a", {
      availableAt: AT,
      visibility: RecordingVisibility.PUBLIC,
    });
    const [early] = visibleRecordings([shown], false, true, talebe(before));
    expect(early).toMatchObject({ availableAt: AT, url: null });
    const [due] = visibleRecordings([shown], false, true, talebe(AT));
    expect(due.url).toBe("https://youtu.be/a");
  });

  it("gives the course team the link before the time", () => {
    const [early] = visibleRecordings([held], true, true, team(before));
    expect(early).toMatchObject({
      availableAt: AT,
      url: "https://youtu.be/a",
    });
    expect(mayPlay(held, team(before))).toBe(true);
    expect(mayPlay(held, talebe(before))).toBe(false);
  });

  it("reads a call that names no reader as a talebe's, now", () => {
    const later = new Date(Date.now() + 3_600_000);
    const [only] = visibleRecordings([row("a", { availableAt: later })], true);
    expect(only.url).toBeNull();
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
    over: Partial<typeof celse> = {},
    availableAt: Date | null = null
  ) =>
    liveStreamFor(
      { ...celse, ...over },
      url,
      recording === null ? null : { status: recording, availableAt },
      true,
      now
    );

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

  it("keeps giving it while a READY recording waits for its release time, and stops at that time (MDRS-288)", () => {
    const release = at(6);
    expect(stream(at(3), RecordingStatus.READY, {}, release)).toBe(url);
    expect(
      stream(
        new Date(release.getTime() - 1),
        RecordingStatus.READY,
        {},
        release
      )
    ).toBe(url);
    expect(stream(release, RecordingStatus.READY, {}, release)).toBeNull();
    expect(stream(at(1), RecordingStatus.READY, {}, at(0.5))).toBeNull();
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
