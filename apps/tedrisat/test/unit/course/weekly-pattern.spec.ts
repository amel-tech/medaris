import {
  expandWeeklyPattern,
  type IWeeklyPattern,
  MAX_BATCH_SESSIONS,
  WeeklyPatternInvalid,
  zonedTimeToInstant,
} from "../../../src/course/domain/weekly-pattern";

/** The wall-clock time `date` shows in `timeZone`, "HH:mm". */
const localTime = (date: Date, timeZone: string) =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);

const problemOf = (pattern: IWeeklyPattern): string | undefined => {
  try {
    expandWeeklyPattern(pattern);
    return undefined;
  } catch (error) {
    expect(error).toBeInstanceOf(WeeklyPatternInvalid);
    return (error as WeeklyPatternInvalid).problem;
  }
};

const istanbul: IWeeklyPattern = {
  weekdays: [2, 4],
  startTime: "21:00",
  timeZone: "Europe/Istanbul",
  startDate: "2026-10-06",
  count: 8,
};

describe("expandWeeklyPattern (MDRS-109)", () => {
  it("Tuesday and Thursday 21:00 Istanbul from 6 October, 8 sessions: 18:00 UTC in weeks 1–4", () => {
    const sessions = expandWeeklyPattern(istanbul);

    expect(sessions.map((s) => s.scheduledAt.toISOString())).toEqual([
      "2026-10-06T18:00:00.000Z",
      "2026-10-08T18:00:00.000Z",
      "2026-10-13T18:00:00.000Z",
      "2026-10-15T18:00:00.000Z",
      "2026-10-20T18:00:00.000Z",
      "2026-10-22T18:00:00.000Z",
      "2026-10-27T18:00:00.000Z",
      "2026-10-29T18:00:00.000Z",
    ]);
    expect(sessions.map((s) => s.weekNumber)).toEqual([1, 1, 2, 2, 3, 3, 4, 4]);
    expect(sessions[0].localDate).toBe("2026-10-06");
  });

  it("keeps 21:00 Berlin time on both sides of the end of daylight saving (25 October 2026)", () => {
    const sessions = expandWeeklyPattern({
      weekdays: [7],
      startTime: "21:00",
      timeZone: "Europe/Berlin",
      startDate: "2026-10-18",
      count: 3,
    });

    // CEST (+2) before the change, CET (+1) from the evening of the 25th.
    expect(sessions.map((s) => s.scheduledAt.toISOString())).toEqual([
      "2026-10-18T19:00:00.000Z",
      "2026-10-25T20:00:00.000Z",
      "2026-11-01T20:00:00.000Z",
    ]);
    for (const s of sessions) {
      expect(localTime(s.scheduledAt, "Europe/Berlin")).toBe("21:00");
    }
  });

  it("keeps the local time when daylight saving starts, too", () => {
    const sessions = expandWeeklyPattern({
      weekdays: [6],
      startTime: "09:30",
      timeZone: "Europe/Berlin",
      startDate: "2027-03-20",
      endDate: "2027-04-03",
    });
    expect(sessions.map((s) => s.scheduledAt.toISOString())).toEqual([
      "2027-03-20T08:30:00.000Z",
      "2027-03-27T08:30:00.000Z",
      "2027-04-03T07:30:00.000Z",
    ]);
  });

  it("places sessions by Monday-to-Sunday week, counting the start date's week as 1", () => {
    // Starts on a Thursday: that Thursday is week 1, the next Tuesday week 2.
    const sessions = expandWeeklyPattern({
      ...istanbul,
      startDate: "2026-10-08",
      count: 3,
    });
    expect(sessions.map((s) => [s.localDate, s.weekNumber])).toEqual([
      ["2026-10-08", 1],
      ["2026-10-13", 2],
      ["2026-10-15", 2],
    ]);
  });

  it("stops at an inclusive end date", () => {
    const sessions = expandWeeklyPattern({
      ...istanbul,
      count: undefined,
      endDate: "2026-10-13",
    });
    expect(sessions.map((s) => s.localDate)).toEqual([
      "2026-10-06",
      "2026-10-08",
      "2026-10-13",
    ]);
  });

  it("uses the pattern's local calendar date, not the UTC one", () => {
    // 01:00 in Istanbul is still the previous day in UTC.
    const [first] = expandWeeklyPattern({
      ...istanbul,
      startTime: "01:00",
      count: 1,
    });
    expect(first.localDate).toBe("2026-10-06");
    expect(first.scheduledAt.toISOString()).toBe("2026-10-05T22:00:00.000Z");
  });

  it("refuses a pattern with both or neither of endDate and count", () => {
    expect(problemOf({ ...istanbul, endDate: "2026-11-01" })).toBe(
      "END_OR_COUNT_REQUIRED"
    );
    expect(problemOf({ ...istanbul, count: undefined })).toBe(
      "END_OR_COUNT_REQUIRED"
    );
  });

  it("refuses an end before the start, and a day the calendar does not have", () => {
    expect(
      problemOf({ ...istanbul, count: undefined, endDate: "2026-10-05" })
    ).toBe("END_BEFORE_START");
    expect(problemOf({ ...istanbul, startDate: "2026-02-30" })).toBe(
      "INVALID_DATE"
    );
    expect(problemOf({ ...istanbul, startDate: "6 October" })).toBe(
      "INVALID_DATE"
    );
  });

  it("refuses a range with no matching weekday", () => {
    expect(
      problemOf({
        ...istanbul,
        weekdays: [1],
        count: undefined,
        endDate: "2026-10-08",
      })
    ).toBe("NO_SESSIONS");
  });

  it(`never produces more than ${MAX_BATCH_SESSIONS} sessions or spans more than a year`, () => {
    expect(problemOf({ ...istanbul, count: MAX_BATCH_SESSIONS + 1 })).toBe(
      "TOO_MANY_SESSIONS"
    );
    expect(
      problemOf({
        ...istanbul,
        weekdays: [1, 2, 3, 4, 5, 6, 7],
        count: undefined,
        endDate: "2027-06-01",
      })
    ).toBe("TOO_MANY_SESSIONS");
    expect(
      problemOf({
        ...istanbul,
        count: undefined,
        endDate: "2027-10-07",
      })
    ).toBe("RANGE_TOO_LONG");
    // One session a week cannot reach 100 inside a year.
    expect(problemOf({ ...istanbul, weekdays: [2], count: 100 })).toBe(
      "RANGE_TOO_LONG"
    );
  });
});

describe("zonedTimeToInstant", () => {
  const day = (iso: string) => Date.parse(`${iso}T00:00:00Z`) / 86_400_000;

  it("moves a time the spring change skips one hour on, like @medaris/utils", () => {
    // 02:30 does not exist in Berlin on 28 March 2027.
    const at = zonedTimeToInstant(day("2027-03-28"), 150, "Europe/Berlin");
    expect(localTime(at, "Europe/Berlin")).toBe("03:30");
  });

  it("resolves a repeated autumn time to its second occurrence", () => {
    const at = zonedTimeToInstant(day("2026-10-25"), 150, "Europe/Berlin");
    expect(at.toISOString()).toBe("2026-10-25T01:30:00.000Z");
  });
});
