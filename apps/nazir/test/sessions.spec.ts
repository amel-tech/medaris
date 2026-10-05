import { describe, expect, it } from "vitest";
import {
  addDays,
  courseMoved,
  fieldsOf,
  groupSessions,
  instantOf,
  isoWeekdayOf,
  linkProblem,
  liveStreamProblem,
  makeUpFields,
  makeUpRequest,
  type PlanForm,
  planErrors,
  planHref,
  planPattern,
  planRequest,
  planSummary,
  type SessionFact,
  sendableLink,
  sessionErrorKey,
  sessionFacts,
  sessionRows,
  sessionsHref,
  streamsOf,
  weekdayName,
  whenLabel,
} from "~/features/sessions/sessions";

/** Celseler as rules: the sessions against the clock, the checks before a write, and what each write sends. */

const NOW = new Date("2026-10-02T12:00:00+03:00");

const fact = (over: Partial<SessionFact> = {}): SessionFact => ({
  id: "l-1",
  title: "Hafta 1",
  weekNumber: 1,
  startsAt: "2026-10-05T18:00:00.000Z",
  durationMinutes: 60,
  meetingUrl: null,
  cancelledAt: null,
  replacementId: null,
  ...over,
});

const lesson = (over: Record<string, unknown> = {}) => ({
  id: "l-1",
  title: "Hafta 1",
  type: "LIVE",
  scheduledAt: new Date("2026-10-05T18:00:00Z"),
  durationMinutes: 90,
  meetingUrl: "https://zoom.us/j/123",
  cancelledAt: null,
  ...over,
});

describe("the addresses", () => {
  it("lead to the course's Celseler and to its planner", () => {
    expect(sessionsHref("c-1")).toBe("/ders/c-1/celseler");
    expect(planHref("c-1")).toBe("/ders/c-1/celseler/planla");
  });
});

describe("the sessions of a course", () => {
  const course = {
    weeks: [
      {
        weekNumber: 2,
        lessons: [
          lesson({
            id: "l-3",
            title: "Hafta 2",
            scheduledAt: new Date("2026-10-12T18:00:00Z"),
            durationMinutes: null,
            meetingUrl: undefined,
          }),
          lesson({ id: "l-video", type: "VIDEO" }),
          lesson({ id: "l-untimed", scheduledAt: undefined }),
        ],
      },
      {
        weekNumber: 1,
        lessons: [
          lesson({
            id: "l-2",
            cancelledAt: new Date("2026-10-03T08:00:00Z"),
          }),
        ],
      },
    ],
  };

  it("are the live lessons that have a time, by date; any other lesson is no session", () => {
    const facts = sessionFacts(course as never);
    expect(facts.map((f) => f.id)).toEqual(["l-2", "l-3"]);
    expect(facts[0]).toEqual({
      id: "l-2",
      title: "Hafta 1",
      weekNumber: 1,
      startsAt: "2026-10-05T18:00:00.000Z",
      durationMinutes: 90,
      meetingUrl: "https://zoom.us/j/123",
      cancelledAt: "2026-10-03T08:00:00.000Z",
      replacementId: null,
    });
  });

  it("carry the make-up a cancelled session names, and none for a session that stands", () => {
    const named = sessionFacts({
      weeks: [
        {
          weekNumber: 1,
          lessons: [
            lesson({
              id: "l-1",
              cancelledAt: new Date("2026-10-03T08:00:00Z"),
              replacementLessonId: "l-2",
            }),
            lesson({
              id: "l-2",
              scheduledAt: new Date("2026-10-12T18:00:00Z"),
              replacementLessonId: "l-9",
            }),
          ],
        },
      ],
    } as never);
    expect(named.map((f) => [f.id, f.replacementId])).toEqual([
      ["l-1", "l-2"],
      ["l-2", null],
    ]);
  });

  it("take a lesson without a length for an hour and one without a link for none", () => {
    expect(sessionFacts(course as never)[1]).toMatchObject({
      durationMinutes: 60,
      meetingUrl: null,
      cancelledAt: null,
    });
  });

  it("list the streams that are set, by session", () => {
    expect(
      streamsOf([
        { lessonId: "l-1", liveStreamUrl: "https://youtu.be/abc" },
        { lessonId: "l-2", liveStreamUrl: null },
      ])
    ).toEqual({ "l-1": "https://youtu.be/abc" });
  });
});

describe("a session against the clock", () => {
  const state = (over: Partial<SessionFact>, now: Date) =>
    sessionRows([fact(over)], now)[0];

  it("is planned before it starts, live while it runs, over after it", () => {
    const start = Date.parse("2026-10-05T18:00:00Z");
    expect(state({}, new Date(start - 1)).state).toBe("scheduled");
    expect(state({}, new Date(start)).state).toBe("live");
    expect(state({}, new Date(start + 59 * 60_000)).state).toBe("live");
    expect(state({}, new Date(start + 60 * 60_000)).state).toBe("ended");
  });

  it("says how long it has been running while it is live, and nothing otherwise", () => {
    const start = Date.parse("2026-10-05T18:00:00Z");
    expect(state({}, new Date(start + 12 * 60_000)).minutesLive).toBe(12);
    expect(state({}, new Date(start - 60_000)).minutesLive).toBeNull();
  });

  it("is the make-up of the cancelled session that names it, and no other", () => {
    const rows = sessionRows(
      [
        fact({
          id: "l-1",
          cancelledAt: "2026-10-03T08:00:00.000Z",
          replacementId: "l-2",
        }),
        fact({ id: "l-2", startsAt: "2026-10-12T18:00:00.000Z" }),
        fact({ id: "l-3", startsAt: "2026-10-19T18:00:00.000Z" }),
      ],
      NOW
    );
    expect(rows.map((row) => [row.id, row.isMakeUp])).toEqual([
      ["l-1", false],
      ["l-2", true],
      ["l-3", false],
    ]);
  });

  it("is cancelled whatever the clock says", () => {
    expect(state({ cancelledAt: "2026-10-03T08:00:00.000Z" }, NOW).state).toBe(
      "cancelled"
    );
    expect(
      state(
        { cancelledAt: "2026-10-03T08:00:00.000Z" },
        new Date("2027-01-01T00:00:00Z")
      ).state
    ).toBe("cancelled");
  });
});

describe("the two lists", () => {
  const facts = [
    fact({ id: "past-1", startsAt: "2026-09-21T18:00:00.000Z", weekNumber: 1 }),
    fact({ id: "past-2", startsAt: "2026-09-28T18:00:00.000Z", weekNumber: 2 }),
    fact({ id: "next-2", startsAt: "2026-10-12T18:00:00.000Z", weekNumber: 4 }),
    fact({
      id: "next-1",
      startsAt: "2026-10-05T18:00:00.000Z",
      weekNumber: 3,
      cancelledAt: "2026-10-01T08:00:00.000Z",
    }),
  ];
  const groups = groupSessions(sessionRows(facts, NOW), NOW);

  it("hold what has not ended oldest first, and what has newest first", () => {
    expect(groups.upcoming.map((r) => r.id)).toEqual(["next-1", "next-2"]);
    expect(groups.past.map((r) => r.id)).toEqual(["past-2", "past-1"]);
  });

  it("keep a cancelled session whose time has not come among the upcoming and count it", () => {
    expect(groups.cancelledUpcoming).toBe(1);
  });

  it("name the weeks of the upcoming sessions, one number for one week and none for none", () => {
    expect(groups.weekRange).toBe("3–4");
    expect(
      groupSessions(sessionRows([facts[2] as SessionFact], NOW), NOW).weekRange
    ).toBe("4");
    expect(groupSessions([], NOW).weekRange).toBeNull();
  });
});

describe("the meeting link", () => {
  it("may be empty, since it is added when its week comes", () => {
    expect(linkProblem("")).toBeNull();
    expect(linkProblem("   ")).toBeNull();
  });

  it("is refused as typed when it is http, instead of being upgraded", () => {
    expect(linkProblem("http://zoom.us/j/1")).toBe("not-https");
  });

  it("is accepted with no scheme at all, and refused when it is not a link or too long", () => {
    expect(linkProblem("zoom.us/j/1")).toBeNull();
    expect(linkProblem("not a link")).toBe("invalid");
    expect(linkProblem(`https://zoom.us/${"a".repeat(600)}`)).toBe("too-long");
  });

  it("is sent as https, and an empty or refused one is not sent", () => {
    expect(sendableLink("  zoom.us/j/1 ")).toBe("https://zoom.us/j/1");
    expect(sendableLink("")).toBeNull();
    expect(sendableLink("http://zoom.us/j/1")).toBeNull();
  });
});

describe("the live stream link", () => {
  it("is accepted when it is a YouTube video", () => {
    expect(
      liveStreamProblem("https://www.youtube.com/watch?v=abcdefghijk")
    ).toBeNull();
    expect(liveStreamProblem("https://youtu.be/abcdefghijk")).toBeNull();
  });

  it("is told apart by what is wrong with it", () => {
    expect(liveStreamProblem("")).toBe("empty");
    expect(liveStreamProblem("https://zoom.us/j/1")).toBe("notYoutube");
    expect(liveStreamProblem("https://www.youtube.com/@medaris")).toBe(
      "channel"
    );
    expect(liveStreamProblem("http://youtu.be/abcdefghijk")).toBe("notHttps");
  });
});

describe("dates on the viewer's clock", () => {
  it("count calendar days, whatever the zone", () => {
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(isoWeekdayOf("2026-10-05")).toBe(1);
    expect(isoWeekdayOf("2026-10-11")).toBe(7);
  });

  it("read the weekday names off real dates, in the page's language", () => {
    expect(weekdayName("tr", 1, "short")).toBe("Pzt");
    expect(weekdayName("tr", 7, "long")).toBe("Pazar");
    expect(weekdayName("en", 1, "long")).toBe("Monday");
  });

  it("write an instant in the viewer's zone, short and full", () => {
    const at = new Date("2026-10-03T18:00:00Z");
    const where = { locale: "tr", timeZone: "Europe/Istanbul" };
    expect(whenLabel(at, where, "short")).toBe("3 Eki Cmt 21:00");
    expect(whenLabel(at, where, "full")).toBe("3 Ekim 2026 Cumartesi 21:00");
    expect(
      whenLabel(at, { ...where, timeZone: "Europe/Berlin" }, "short")
    ).toBe("3 Eki Cmt 20:00");
  });

  it("turn a date and a time into the instant they name in a zone, and back", () => {
    const at = instantOf("2026-10-12", "21:00", "Europe/Istanbul");
    expect(at?.toISOString()).toBe("2026-10-12T18:00:00.000Z");
    expect(fieldsOf(at as Date, "Europe/Istanbul")).toEqual({
      date: "2026-10-12",
      time: "21:00",
    });
    expect(fieldsOf(at as Date, "America/New_York")).toEqual({
      date: "2026-10-12",
      time: "14:00",
    });
  });

  it("name no instant while the date or the time is missing or malformed", () => {
    expect(instantOf("", "21:00", "Europe/Istanbul")).toBeNull();
    expect(instantOf("2026-10-12", "", "Europe/Istanbul")).toBeNull();
    expect(instantOf("12.10.2026", "21:00", "Europe/Istanbul")).toBeNull();
    expect(instantOf("2026-10-12", "25:00", "Europe/Istanbul")).toBeNull();
  });
});

describe("the plan", () => {
  const weekly: PlanForm = {
    mode: "weekly",
    weekdays: [3, 1],
    startTime: "21:00",
    duration: "60",
    timeZone: "Europe/Istanbul",
    startDate: "2026-10-12",
    endMode: "date",
    endDate: "2026-11-02",
    count: "8",
  };

  it("has nothing wrong with a complete weekly form", () => {
    expect(planErrors(weekly)).toEqual({});
  });

  it("names every field that is wrong", () => {
    expect(
      planErrors({
        ...weekly,
        weekdays: [],
        startTime: "9",
        duration: "0",
        startDate: "",
        endDate: "",
      })
    ).toEqual({
      weekdays: true,
      startTime: true,
      duration: true,
      startDate: true,
      endDate: true,
    });
    expect(planErrors({ ...weekly, duration: "1441" }).duration).toBe(true);
    expect(planErrors({ ...weekly, duration: "1.5" }).duration).toBe(true);
    expect(planErrors({ ...weekly, endDate: "2026-10-01" })).toEqual({
      endBeforeStart: true,
    });
    expect(
      planErrors({ ...weekly, endMode: "count", count: "201" }).count
    ).toBe(true);
    expect(planErrors({ ...weekly, endMode: "count", count: "0" }).count).toBe(
      true
    );
  });

  it("asks for no day and no end of a single session", () => {
    expect(
      planErrors({
        ...weekly,
        mode: "single",
        weekdays: [],
        endDate: "",
        count: "",
      })
    ).toEqual({});
  });

  it("makes a weekly pattern that ends on a date, with the days in order", () => {
    expect(planPattern(weekly)).toEqual({
      weekdays: [1, 3],
      startTime: "21:00",
      timeZone: "Europe/Istanbul",
      startDate: "2026-10-12",
      endDate: "2026-11-02",
    });
  });

  it("makes a weekly pattern that ends after a number of sessions", () => {
    expect(planPattern({ ...weekly, endMode: "count", count: "8" })).toEqual({
      weekdays: [1, 3],
      startTime: "21:00",
      timeZone: "Europe/Istanbul",
      startDate: "2026-10-12",
      count: 8,
    });
  });

  it("makes a single session a pattern of one, on the weekday of its date", () => {
    expect(planPattern({ ...weekly, mode: "single", weekdays: [] })).toEqual({
      weekdays: [1],
      startTime: "21:00",
      timeZone: "Europe/Istanbul",
      startDate: "2026-10-12",
      count: 1,
    });
  });

  it("makes no pattern while the form has a problem", () => {
    expect(planPattern({ ...weekly, startTime: "" })).toBeNull();
  });

  it("sends the pattern with a trimmed title, the length, and the first session's link only when given", () => {
    const pattern = planPattern(weekly);
    if (!pattern) throw new Error("no pattern");
    expect(planRequest(pattern, weekly, "  Haftanın tekrarı ", null)).toEqual({
      ...pattern,
      title: "Haftanın tekrarı",
      durationMinutes: 60,
    });
    expect(
      planRequest(pattern, weekly, "Haftanın tekrarı", "https://zoom.us/j/1")
    ).toMatchObject({ meetingUrl: "https://zoom.us/j/1" });
  });

  it("sums the preview up by count and by first and last day", () => {
    expect(
      planSummary([
        { localDate: "2026-10-19" },
        { localDate: "2026-10-12" },
        { localDate: "2026-10-14" },
      ])
    ).toEqual({ count: 3, first: "2026-10-12", last: "2026-10-19" });
    expect(planSummary([])).toEqual({ count: 0, first: null, last: null });
  });
});

describe("the make-up of a cancelled session", () => {
  const cancelled = { title: "Hafta 1", durationMinutes: 90 };

  it("starts a week later at the same time on the viewer's clock", () => {
    expect(
      makeUpFields(new Date("2026-10-05T18:00:00Z"), "Europe/Istanbul")
    ).toEqual({ date: "2026-10-12", time: "21:00" });
    // late in the evening in New York is already the next day in UTC
    expect(
      makeUpFields(new Date("2026-10-06T02:30:00Z"), "America/New_York")
    ).toEqual({ date: "2026-10-12", time: "22:30" });
  });

  it("is one session of the same title and length, with no mark in its title", () => {
    expect(
      makeUpRequest(cancelled, {
        date: "2026-10-14",
        time: "20:30",
        timeZone: "Europe/Istanbul",
      })
    ).toEqual({
      weekdays: [3],
      startTime: "20:30",
      timeZone: "Europe/Istanbul",
      startDate: "2026-10-14",
      count: 1,
      title: "Hafta 1",
      durationMinutes: 90,
    });
  });

  it("is nothing while the date or the time is missing", () => {
    expect(
      makeUpRequest(cancelled, {
        date: "",
        time: "20:30",
        timeZone: "Europe/Istanbul",
      })
    ).toBeNull();
  });
});

describe("what the API refuses", () => {
  it("words a refusal from its code, and anything else as 'bir şeyler ters gitti'", () => {
    expect(sessionErrorKey("AUTHZ_FORBIDDEN")).toBe("Problems.actionForbidden");
    expect(sessionErrorKey("COURSE_VERSION_CONFLICT")).toBe(
      "Sessions.errors.versionConflict"
    );
    expect(sessionErrorKey("LESSON_ALREADY_CANCELLED")).toBe(
      "Sessions.errors.alreadyCancelled"
    );
    expect(sessionErrorKey("INVALID_SESSION_PATTERN")).toBe(
      "Sessions.errors.invalidPattern"
    );
    expect(sessionErrorKey("LESSON_REPLACEMENT_INVALID")).toBe(
      "Sessions.errors.replacementInvalid"
    );
    expect(sessionErrorKey("LESSON_REPLACEMENT_TAKEN")).toBe(
      "Sessions.errors.replacementTaken"
    );
    expect(sessionErrorKey("LESSON_NOT_LIVE")).toBe(
      "Sessions.stream.errors.notLive"
    );
    expect(sessionErrorKey("LESSON_CANCELLED")).toBe(
      "Sessions.stream.errors.cancelled"
    );
    expect(sessionErrorKey("LIVE_STREAM_URL_INVALID")).toBe(
      "Sessions.stream.problems.noVideo"
    );
    expect(sessionErrorKey("SOMETHING_NEW")).toBe("Problems.actionGeneric");
    expect(sessionErrorKey("")).toBe("Problems.actionGeneric");
  });

  it("reads the page again only when the course moved", () => {
    expect(courseMoved("COURSE_VERSION_CONFLICT")).toBe(true);
    expect(courseMoved("AUTHZ_FORBIDDEN")).toBe(false);
  });
});
