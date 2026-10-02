import type {
  CourseDetailResponse,
  LessonResponse,
  WeekResponse,
} from "@medaris/services/tedrisat";
import { describe, expect, it } from "vitest";
import {
  calendarDaysUntil,
  courseRhythm,
  courseSpan,
  courseTotals,
  courseViewState,
  hasEnded,
  nextSession,
  parseProgress,
  relativeDay,
  sentAt,
  weekState,
} from "~/features/courses/course-view";

// 3 Ekim 2026 Cumartesi 12:00 İstanbul (UTC+3).
const NOW = Date.parse("2026-10-03T09:00:00Z");
const ZONE = "Europe/Istanbul";

const lesson = (
  id: string,
  at: string | null,
  extra: Partial<LessonResponse> = {}
) =>
  ({
    id,
    title: id,
    type: "LIVE",
    scheduledAt: at === null ? null : new Date(at),
    durationMinutes: 60,
    cancelledAt: null,
    isPreview: false,
    ...extra,
  }) as unknown as LessonResponse;

const week = (n: number, lessons: LessonResponse[]) =>
  ({
    id: `w${n}`,
    weekNumber: n,
    title: `Hafta ${n}`,
    lessons,
  }) as WeekResponse;

const course = (weeks: WeekResponse[]) =>
  ({ id: "c1", timeZone: ZONE, weeks }) as unknown as CourseDetailResponse;

describe("courseViewState", () => {
  const withStatus = (status: string | null) =>
    ({
      enrollment: status === null ? null : { status },
    }) as Pick<CourseDetailResponse, "enrollment">;

  it("names the state a caller's enrollment puts the page in", () => {
    expect(courseViewState(withStatus(null), false)).toBe("visitor");
    expect(courseViewState(withStatus("ENROLLED"), false)).toBe("visitor");
    expect(courseViewState(withStatus(null), true)).toBe("apply");
    expect(courseViewState(withStatus("PENDING"), true)).toBe("pending");
    expect(courseViewState(withStatus("ENROLLED"), true)).toBe("enrolled");
    expect(courseViewState(withStatus("COMPLETED"), true)).toBe("completed");
    expect(courseViewState(withStatus("REVOKED"), true)).toBe("revoked");
  });
});

describe("the programme in numbers", () => {
  const c = course([
    week(1, [lesson("a", "2026-09-13T18:00:00Z", { durationMinutes: 105 })]),
    week(2, [
      lesson("b", "2026-09-20T18:00:00Z", { durationMinutes: 105 }),
      lesson("c", null, { durationMinutes: null }),
    ]),
  ]);

  it("counts weeks, sessions and whole hours", () => {
    expect(courseTotals(c)).toEqual({ weeks: 2, sessions: 3, hours: 4 });
  });

  it("gives the span from the first to the last scheduled session, in the course's zone", () => {
    expect(courseSpan(c, "tr")).toBe("13 Eylül – 20 Eylül 2026");
  });
});

describe("courseRhythm", () => {
  it("says the weekday, the clock and the length when every session shares them", () => {
    const c = course([
      week(1, [lesson("a", "2026-09-13T18:00:00Z")]),
      week(2, [lesson("b", "2026-09-20T18:00:00Z")]),
    ]);
    expect(courseRhythm(c, "tr")).toEqual({
      weekday: "pazar",
      clock: "21:00",
      minutes: 60,
    });
  });

  it("says nothing when the sessions have no common rhythm", () => {
    const c = course([
      week(1, [lesson("a", "2026-09-13T18:00:00Z")]),
      week(2, [lesson("b", "2026-09-22T18:00:00Z")]),
    ]);
    expect(courseRhythm(c, "tr")).toBeNull();
  });
});

describe("nextSession (tedris/12, criterion 3)", () => {
  it("is the nearest session ahead that was not cancelled; past ones and cancelled ones are skipped", () => {
    const c = course([
      week(1, [lesson("past", "2026-09-26T18:00:00Z")]),
      week(2, [
        lesson("cancelled", "2026-10-04T17:00:00Z", {
          cancelledAt: new Date("2026-10-01T10:00:00Z"),
        }),
        lesson("makeup", "2026-10-07T18:00:00Z"),
        lesson("soon", "2026-10-03T18:00:00Z"),
      ]),
    ]);
    const next = nextSession(c, NOW);
    expect(next?.lesson.id).toBe("soon");
    expect(next?.weekNumber).toBe(2);
    const afterSoon = nextSession(c, Date.parse("2026-10-03T19:00:00Z"));
    expect(afterSoon?.lesson.id).toBe("makeup");
  });

  it("is null when nothing is ahead", () => {
    expect(
      nextSession(course([week(1, [lesson("p", "2026-09-01T18:00:00Z")])]), NOW)
    ).toBeNull();
  });
});

describe("weekState", () => {
  it("is done when every session is over, active when it holds the next one, otherwise default", () => {
    const done = week(1, [lesson("a", "2026-09-26T18:00:00Z")]);
    const active = week(2, [lesson("b", "2026-10-04T18:00:00Z")]);
    const later = week(3, [lesson("c", "2026-10-11T18:00:00Z")]);
    expect(weekState(done, 2, NOW)).toBe("done");
    expect(weekState(active, 2, NOW)).toBe("active");
    expect(weekState(later, 2, NOW)).toBe("default");
    expect(weekState(week(4, [lesson("d", null)]), 2, NOW)).toBe("default");
  });

  it("counts a cancelled session as over", () => {
    const w = week(1, [
      lesson("a", "2026-09-26T18:00:00Z"),
      lesson("b", "2026-10-09T18:00:00Z", { cancelledAt: new Date() }),
    ]);
    expect(weekState(w, null, NOW)).toBe("done");
  });
});

describe("hasEnded", () => {
  it("is over once the start plus the length has passed", () => {
    const l = lesson("a", "2026-10-03T08:30:00Z", { durationMinutes: 45 });
    expect(hasEnded(l, Date.parse("2026-10-03T09:10:00Z"))).toBe(false);
    expect(hasEnded(l, Date.parse("2026-10-03T09:15:00Z"))).toBe(true);
  });
});

describe("days and words", () => {
  it("counts calendar days in the course's zone, not hours", () => {
    // 23:30 İstanbul on the 3rd is 20:30Z; the 4th at 00:10 İstanbul is the next day.
    const late = Date.parse("2026-10-03T20:30:00Z");
    expect(
      calendarDaysUntil(Date.parse("2026-10-03T21:10:00Z"), late, ZONE)
    ).toBe(1);
    expect(calendarDaysUntil(late, late, ZONE)).toBe(0);
  });

  it("speaks them in the language: yarın, öbür gün, 3 gün sonra", () => {
    const at = (days: number) => NOW + days * 86_400_000;
    expect(relativeDay(at(1), NOW, "tr", ZONE)).toBe("yarın");
    expect(relativeDay(at(2), NOW, "tr", ZONE)).toBe("öbür gün");
    expect(relativeDay(at(3), NOW, "tr", ZONE)).toBe("3 gün sonra");
  });

  it("writes the time of an application: today with the clock, else the date", () => {
    expect(
      sentAt(Date.parse("2026-10-03T07:02:00Z"), NOW, "tr", ZONE, "bugün")
    ).toBe("bugün 10:02");
    expect(
      sentAt(Date.parse("2026-10-01T07:02:00Z"), NOW, "tr", ZONE, "bugün")
    ).toBe("1 Ekim 10:02");
  });
});

describe("parseProgress (tedris/12: 0 to 100, whole numbers)", () => {
  it("accepts the bounds and everything between", () => {
    expect(parseProgress("0")).toBe(0);
    expect(parseProgress(" 55 ")).toBe(55);
    expect(parseProgress("100")).toBe(100);
  });

  it("refuses everything else", () => {
    for (const bad of ["", "101", "-1", "5.5", "abc", "1e2", "1000"]) {
      expect(parseProgress(bad)).toBeNull();
    }
  });
});
