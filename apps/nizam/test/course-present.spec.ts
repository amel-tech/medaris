import type { CourseDetailResponse } from "@medaris/services/tedrisat";
import { describe, expect, it } from "vitest";
import { curriculumPayload } from "~/features/courses/payload";
import {
  addDays,
  addMember,
  arabicOfCoverLabel,
  copyWeek,
  courseErrorKey,
  coursePattern,
  curriculumErrors,
  groupSessions,
  isoWeekdayOf,
  type LessonDraft,
  linkProblem,
  normalizedImam,
  type PlanForm,
  patternDates,
  planErrors,
  planPattern,
  planSummary,
  removeMember,
  type ScheduleForm,
  sampleOf,
  sampleOptions,
  scheduleErrors,
  sessionRows,
  sessionState,
  teamChanged,
  teamDiff,
  teamOfCourse,
  teamPayload,
  teamReady,
  type WeekDraft,
  weekDraftsOf,
  weekFacts,
} from "~/features/courses/present";

const AHMED = { userId: "a1", name: "Ahmed" };
const HASAN = { userId: "b2", name: "Hasan" };
const ZEYD = { userId: "c3", name: "Zeyd" };

describe("calendar helpers", () => {
  it("adds calendar days across a month and reads the ISO weekday", () => {
    expect(addDays("2026-10-30", 3)).toBe("2026-11-02");
    expect(isoWeekdayOf("2026-10-12")).toBe(1); // a Monday
    expect(isoWeekdayOf("2026-10-18")).toBe(7);
  });
});

describe("the course schedule (nizam 32)", () => {
  const form: ScheduleForm = {
    startDate: "2026-10-12",
    weeks: "8",
    weekdays: [1],
    startTime: "21:00",
    duration: "60",
    timeZone: "Europe/Istanbul",
  };

  it("makes 8 sessions of 8 weeks on Mondays, 12 Oct to 30 Nov", () => {
    const pattern = coursePattern(form);
    expect(pattern).toMatchObject({
      weekdays: [1],
      startDate: "2026-10-12",
      endDate: "2026-12-06",
    });
    const dates = patternDates(pattern as NonNullable<typeof pattern>);
    expect(dates).toHaveLength(8);
    expect(dates[0]).toBe("2026-10-12");
    expect(dates[7]).toBe("2026-11-30");
  });

  it("counts two sessions a week for two days, and starts on the next chosen day", () => {
    const pattern = coursePattern({
      ...form,
      weeks: "2",
      startDate: "2026-10-13",
      weekdays: [5, 1],
    });
    expect(pattern?.weekdays).toEqual([1, 5]);
    expect(patternDates(pattern as NonNullable<typeof pattern>)).toEqual([
      "2026-10-16",
      "2026-10-19",
      "2026-10-23",
      "2026-10-26",
    ]);
  });

  it("is null while any field is wrong, and names the field", () => {
    expect(
      scheduleErrors({
        ...form,
        startDate: "",
        weeks: "0",
        weekdays: [],
        startTime: "9",
        duration: "1441",
      })
    ).toEqual({
      startDate: true,
      weeks: true,
      weekdays: true,
      startTime: true,
      duration: true,
    });
    expect(coursePattern({ ...form, weekdays: [] })).toBeNull();
  });
});

describe("the session plan (nizam 55)", () => {
  const weekly: PlanForm = {
    mode: "weekly",
    weekdays: [5],
    startTime: "21:00",
    duration: "30",
    timeZone: "Europe/Istanbul",
    startDate: "2026-10-09",
    endMode: "date",
    endDate: "2026-10-23",
    count: "8",
  };

  it("repeats on Fridays from 9 to 23 October: three sessions", () => {
    const pattern = planPattern(weekly);
    expect(pattern).toMatchObject({ endDate: "2026-10-23" });
    expect(patternDates(pattern as NonNullable<typeof pattern>)).toEqual([
      "2026-10-09",
      "2026-10-16",
      "2026-10-23",
    ]);
  });

  it("stops after N sessions in count mode", () => {
    const pattern = planPattern({ ...weekly, endMode: "count", count: "2" });
    expect(pattern).toMatchObject({ count: 2 });
    expect(pattern).not.toHaveProperty("endDate");
    expect(patternDates(pattern as NonNullable<typeof pattern>)).toHaveLength(
      2
    );
  });

  it("makes a one-time session of one on the weekday of its date", () => {
    const pattern = planPattern({ ...weekly, mode: "single", weekdays: [] });
    expect(pattern).toMatchObject({ weekdays: [5], count: 1 });
  });

  it("refuses an end before the start and a missing day", () => {
    expect(planErrors({ ...weekly, endDate: "2026-10-01" })).toEqual({
      endBeforeStart: true,
    });
    expect(planErrors({ ...weekly, weekdays: [] })).toEqual({ weekdays: true });
    expect(planPattern({ ...weekly, weekdays: [] })).toBeNull();
  });

  it("summarises a list by its dates", () => {
    expect(
      planSummary([{ localDate: "2026-10-16" }, { localDate: "2026-10-09" }])
    ).toEqual({ count: 2, first: "2026-10-09", last: "2026-10-16" });
    expect(planSummary([])).toEqual({ count: 0, first: null, last: null });
  });
});

describe("the müderris team (nizam 32 and 33)", () => {
  it("makes the only müderris the imam", () => {
    const team = addMember({ members: [], imamUserId: null }, AHMED);
    expect(normalizedImam(team)).toBe("a1");
    expect(teamReady(team)).toBe(true);
  });

  it("needs a chosen imam once there are several", () => {
    let team = addMember({ members: [], imamUserId: null }, AHMED);
    team = addMember(team, HASAN);
    expect(normalizedImam(team)).toBe("a1");
    // Removing the imam leaves two others and nobody chosen.
    team = addMember(team, ZEYD);
    team = removeMember(team, "a1");
    expect(team.members.map((m) => m.userId)).toEqual(["b2", "c3"]);
    expect(normalizedImam(team)).toBeNull();
    expect(teamReady(team)).toBe(false);
    expect(teamPayload(team, 3)).toBeNull();
    expect(teamReady({ members: [], imamUserId: null })).toBe(false);
  });

  it("does not add a person twice, whatever the case", () => {
    const team = addMember(
      { members: [AHMED], imamUserId: "a1" },
      { ...AHMED, userId: "A1" }
    );
    expect(team.members).toHaveLength(1);
  });

  it("lists the imam first in the payload", () => {
    const team = {
      members: [AHMED, HASAN, ZEYD],
      imamUserId: "c3",
    };
    expect(teamPayload(team, 4)).toEqual({
      version: 4,
      muderris: [
        { userId: "c3", name: "Zeyd" },
        { userId: "a1", name: "Ahmed" },
        { userId: "b2", name: "Hasan" },
      ],
      imamUserId: "c3",
    });
  });

  it("diffs against the stored list: added, removed, imam", () => {
    const before = { members: [AHMED, HASAN], imamUserId: "a1" };
    const after = { members: [HASAN, ZEYD], imamUserId: "b2" };
    expect(teamDiff(before, after)).toEqual({
      added: ["c3"],
      removed: ["a1"],
      imamChanged: true,
    });
    expect(teamChanged(before, before)).toBe(false);
    expect(
      teamChanged(before, { members: [AHMED, HASAN], imamUserId: "b2" })
    ).toBe(true);
  });

  it("reads the stored team off a course detail", () => {
    const course = {
      muderris: [
        { id: "m1", userId: "a1", name: "Ahmed", isImam: false },
        { id: "m2", userId: "b2", name: "Hasan", isImam: true },
        { id: "m3", name: "Misafir", isImam: false },
      ],
    } as unknown as CourseDetailResponse;
    expect(teamOfCourse(course)).toEqual({
      members: [
        { userId: "a1", name: "Ahmed", title: undefined },
        { userId: "b2", name: "Hasan", title: undefined },
      ],
      imamUserId: "b2",
    });
  });
});

describe("sessions against the clock (nizam 56)", () => {
  const at = (iso: string) => new Date(iso);
  const now = at("2026-10-03T18:14:00Z");

  it("derives live, scheduled, ended and cancelled", () => {
    const live = {
      scheduledAt: at("2026-10-03T18:00:00Z"),
      durationMinutes: 60,
    };
    expect(sessionState(live, now)).toBe("live");
    expect(
      sessionState({ ...live, scheduledAt: at("2026-10-04T18:00:00Z") }, now)
    ).toBe("scheduled");
    expect(
      sessionState({ ...live, scheduledAt: at("2026-09-27T18:00:00Z") }, now)
    ).toBe("ended");
    expect(
      sessionState({ ...live, cancelledAt: at("2026-10-03T05:40:00Z") }, now)
    ).toBe("cancelled");
    // A session without a length lasts 60 minutes.
    expect(sessionState({ scheduledAt: at("2026-10-03T16:30:00Z") }, now)).toBe(
      "ended"
    );
  });

  const course = {
    weeks: [
      {
        id: "w4",
        weekNumber: 4,
        title: "Dört",
        lessons: [
          lesson("l1", "2026-09-26T18:00:00Z", { durationMinutes: 45 }),
        ],
      },
      {
        id: "w5",
        weekNumber: 5,
        title: "Beş",
        lessons: [
          lesson("l2", "2026-10-03T18:00:00Z"),
          lesson("l3", "2026-10-04T17:00:00Z", {
            durationMinutes: 45,
            cancelledAt: "2026-10-03T05:40:00Z",
          }),
          lesson("l4", "2026-10-07T18:00:00Z"),
        ],
      },
      {
        id: "w6",
        weekNumber: 6,
        title: "Altı",
        lessons: [
          lesson("l5", "2026-10-10T18:00:00Z", {
            meetingUrl: "https://zoom.us/j/1",
          }),
        ],
      },
    ],
  } as unknown as CourseDetailResponse;

  function lesson(id: string, at: string, extra: Record<string, unknown> = {}) {
    return {
      id,
      weekId: "w",
      title: `Celse ${id}`,
      type: "LIVE",
      durationMinutes: 60,
      scheduledAt: at,
      isPreview: false,
      orderIndex: 0,
      cancelledAt: null,
      replacementLessonId: null,
      ...extra,
    };
  }

  it("groups upcoming oldest first and past newest first, counts as listed", () => {
    const groups = groupSessions(sessionRows(course, now), now);
    expect(groups.upcoming.map((r) => r.id)).toEqual(["l2", "l3", "l4", "l5"]);
    expect(groups.past.map((r) => r.id)).toEqual(["l1"]);
    expect(groups.cancelledUpcoming).toBe(1);
    expect(groups.weekRange).toBe("5–6");
    const live = groups.upcoming[0];
    expect(live?.state).toBe("live");
    expect(live?.minutesLive).toBe(14);
  });

  it("has no week range when nothing is upcoming", () => {
    const groups = groupSessions([], now);
    expect(groups.weekRange).toBeNull();
    expect(groups.upcoming).toEqual([]);
  });

  it("offers every live session as the sample and finds the current one", () => {
    const options = sampleOptions(course);
    expect(options.map((o) => o.value)).toEqual([
      "",
      "l1",
      "l2",
      "l3",
      "l4",
      "l5",
    ]);
    expect(sampleOf(course)).toBe("");
    const withSample = {
      weeks: [
        {
          ...course.weeks[0],
          lessons: [{ ...course.weeks[0]?.lessons[0], isPreview: true }],
        },
      ],
    } as unknown as CourseDetailResponse;
    expect(sampleOf(withSample)).toBe("l1");
  });
});

describe("meeting links", () => {
  it("accepts empty and https, refuses http", () => {
    expect(linkProblem("")).toBeNull();
    expect(linkProblem("https://zoom.us/j/86357204418")).toBeNull();
    expect(linkProblem("zoom.us/j/86357204418")).toBeNull();
    expect(linkProblem("http://zoom.us/j/81234567890")).toBe("not-https");
  });
});

describe("the curriculum (nizam 54)", () => {
  const draft = (over: Partial<LessonDraft> = {}): LessonDraft => ({
    id: "l1",
    title: "Mehmûz fiiller",
    type: "LIVE",
    date: "2026-10-03",
    time: "21:00",
    duration: "60",
    meetingUrl: "",
    kaynak: "",
    agenda: [],
    isPreview: false,
    cancelledAt: null,
    cancelReason: null,
    scheduledAtIso: "2026-10-03T18:00:00.000Z",
    makeup: false,
    ...over,
  });
  const week = (
    lessons: LessonDraft[],
    over: Partial<WeekDraft> = {}
  ): WeekDraft => ({
    id: "w5",
    weekNumber: 5,
    title: "Mehmûz fiiller",
    summary: "",
    lessons,
    ...over,
  });

  it("is valid when titles, dates, times and lengths are there and links are https", () => {
    expect(curriculumErrors("Emsile ve Bina", [week([draft()])])).toEqual([]);
  });

  it("names every problem with its week and session", () => {
    const errors = curriculumErrors("E", [
      week(
        [
          draft({ title: "", date: "", time: "", duration: "0" }),
          draft({ id: "l2", meetingUrl: "http://zoom.us/j/81234567890" }),
        ],
        { title: " " }
      ),
    ]);
    expect(errors).toEqual([
      { kind: "title" },
      { kind: "weekTitle", weekIndex: 0 },
      { kind: "lessonTitle", weekIndex: 0, lessonIndex: 0 },
      { kind: "lessonDate", weekIndex: 0, lessonIndex: 0 },
      { kind: "lessonTime", weekIndex: 0, lessonIndex: 0 },
      { kind: "lessonDuration", weekIndex: 0, lessonIndex: 0 },
      { kind: "link", weekIndex: 0, lessonIndex: 1 },
    ]);
  });

  it("does not check a cancelled session", () => {
    expect(
      curriculumErrors("Emsile", [
        week([draft({ title: "", cancelledAt: "2026-10-03T05:40:00.000Z" })]),
      ])
    ).toEqual([]);
  });

  it("copies a week 7 days later, with no links, ids or cancelled sessions", () => {
    const source = week([
      draft({ meetingUrl: "https://zoom.us/j/1", isPreview: true }),
      draft({
        id: "l2",
        date: "2026-10-04",
        cancelledAt: "2026-10-03T05:40:00.000Z",
      }),
    ]);
    const copy = copyWeek(source, 6);
    expect(copy.weekNumber).toBe(6);
    expect(copy.id).toBeUndefined();
    expect(copy.lessons).toHaveLength(1);
    expect(copy.lessons[0]).toMatchObject({
      id: undefined,
      date: "2026-10-10",
      time: "21:00",
      meetingUrl: "",
      isPreview: false,
    });
  });

  it("totals a week's sessions and minutes and gives its date span", () => {
    expect(
      weekFacts(
        week([
          draft({ date: "2026-10-04", duration: "45" }),
          draft({ id: "l2", date: "2026-10-03", duration: "60" }),
          draft({ id: "l3", cancelledAt: "2026-10-03T05:40:00.000Z" }),
        ])
      )
    ).toEqual({
      sessions: 2,
      minutes: 105,
      from: "2026-10-03",
      to: "2026-10-04",
    });
  });

  const detail = {
    id: "c1",
    version: 7,
    timeZone: "Europe/Istanbul",
    title: "Emsile ve Bina",
    description: "Sarf",
    coverHue: 20,
    muderris: [
      {
        id: "m1",
        userId: "a1",
        name: "Ahmed",
        title: null,
        bio: null,
        avatarHue: 120,
        isImam: true,
      },
    ],
    resources: [{ id: "r1", name: "Kitap", meta: null, type: null, url: null }],
    weeks: [
      {
        id: "w5",
        weekNumber: 5,
        title: "Mehmûz fiiller",
        summary: null,
        lessons: [
          {
            id: "l1",
            weekId: "w5",
            title: "Birinci",
            type: "LIVE",
            durationMinutes: 60,
            scheduledAt: "2026-10-03T18:00:00.000Z",
            meetingUrl: "https://zoom.us/j/1",
            isPreview: false,
            orderIndex: 0,
            cancelledAt: null,
            replacementLessonId: null,
          },
          {
            id: "l2",
            weekId: "w5",
            title: "İptal",
            type: "LIVE",
            durationMinutes: 45,
            scheduledAt: "2026-10-04T17:00:00.000Z",
            isPreview: false,
            orderIndex: 1,
            cancelledAt: "2026-10-03T05:40:00.000Z",
            replacementLessonId: "l3",
          },
          {
            id: "l3",
            weekId: "w5",
            title: "Telafi",
            type: "LIVE",
            durationMinutes: 45,
            scheduledAt: "2026-10-07T18:00:00.000Z",
            isPreview: false,
            orderIndex: 2,
            cancelledAt: null,
            replacementLessonId: null,
          },
        ],
      },
    ],
  } as unknown as CourseDetailResponse;

  it("reads drafts on the course's clock and marks the make-up session", () => {
    const [w] = weekDraftsOf(detail);
    expect(w?.lessons[0]).toMatchObject({
      date: "2026-10-03",
      time: "21:00",
      duration: "60",
      meetingUrl: "https://zoom.us/j/1",
      makeup: false,
    });
    expect(w?.lessons[2]?.makeup).toBe(true);
  });

  it("builds the whole-course PUT with the version, the team and the resources", () => {
    const weeks = weekDraftsOf(detail);
    (weeks[0] as WeekDraft).lessons[0] = {
      ...(weeks[0] as WeekDraft).lessons[0],
      title: "Birinci (düzeltildi)",
      time: "20:00",
      meetingUrl: "",
    } as LessonDraft;
    const body = curriculumPayload(detail, {
      title: "Emsile ve Bina",
      description: "Sarf",
      tone: "bordo",
      weeks,
    });
    expect(body.version).toBe(7);
    expect(body.coverHue).toBe(20);
    expect(body.muderris).toEqual([
      {
        id: "m1",
        userId: "a1",
        name: "Ahmed",
        title: undefined,
        bio: undefined,
        avatarHue: 120,
      },
    ]);
    expect(body.resources?.[0]).toMatchObject({ id: "r1", name: "Kitap" });
    const lessons = body.weeks?.[0]?.lessons ?? [];
    expect(lessons[0]).toMatchObject({
      id: "l1",
      title: "Birinci (düzeltildi)",
      meetingUrl: null, // an emptied link is cleared, not kept
    });
    expect(lessons[0]?.scheduledAt?.toISOString()).toBe(
      "2026-10-03T17:00:00.000Z"
    );
    // The cancelled session goes back as it was stored.
    expect(lessons[1]?.scheduledAt?.toISOString()).toBe(
      "2026-10-04T17:00:00.000Z"
    );
  });
});

describe("cover and errors", () => {
  it("prints the Arabic name of the science", () => {
    expect(arabicOfCoverLabel("Nahiv")).toBe("النحو");
    expect(arabicOfCoverLabel("Yok")).toBeUndefined();
    expect(arabicOfCoverLabel(null)).toBeUndefined();
  });

  it("maps tedrisat's refusals to a message key", () => {
    expect(courseErrorKey({ code: "COURSE_VERSION_CONFLICT" })).toBe(
      "versionConflict"
    );
    expect(courseErrorKey({ code: "MUDERRIS_LIST_INVALID" })).toBe(
      "listInvalid"
    );
    expect(courseErrorKey({ code: "SOMETHING_ELSE" })).toBe("generic");
    expect(courseErrorKey(null)).toBe("generic");
  });
});
