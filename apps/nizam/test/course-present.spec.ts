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
  curriculumDirty,
  curriculumErrors,
  emptyLessonResource,
  emptyResource,
  FRESH_ATTENDANCE,
  groupSessions,
  inPersonChoiceOf,
  inPersonOverrideOf,
  isoWeekdayOf,
  type LessonDraft,
  type LessonResourceDraft,
  lessonResourceDraftsOf,
  lessonWithoutAccess,
  linkHelpKey,
  linkProblem,
  moveRow,
  normalizedImam,
  type PlanForm,
  patternDates,
  planErrors,
  planPattern,
  planSummary,
  type ResourceDraft,
  removeMember,
  resourceDraftsOf,
  rowAttendance,
  type ScheduleForm,
  sampleOf,
  sampleOptions,
  scheduleErrors,
  sessionRows,
  sessionState,
  settingsOf,
  settingsPatch,
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
    attendance: { inPersonOverride: null, hasLiveStream: false },
    resources: [],
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

  it("copies a week's sessions as new ones: they follow the course and have no stream (MDRS-283)", () => {
    const copy = copyWeek(
      week([
        draft({
          attendance: { inPersonOverride: false, hasLiveStream: true },
        }),
      ]),
      6
    );
    expect(copy.lessons[0]?.attendance).toEqual(FRESH_ATTENDANCE);
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

  it("builds the whole-course PUT with the version and the team", () => {
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
      resources: resourceDraftsOf(detail),
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

  it("round-trips a session's kaynak, trimmed, and clears an emptied one with null (MDRS-279)", () => {
    const source = {
      ...detail,
      weeks: [
        {
          ...detail.weeks[0],
          lessons: [
            { ...detail.weeks[0]?.lessons[0], kaynak: "Bina · s. 4-9" },
          ],
        },
      ],
    } as unknown as CourseDetailResponse;
    const weeks = weekDraftsOf(source);
    const first = (weeks[0] as WeekDraft).lessons[0] as LessonDraft;
    expect(first.kaynak).toBe("Bina · s. 4-9");
    const sent = (kaynak: string) => {
      first.kaynak = kaynak;
      return curriculumPayload(source, {
        title: "Emsile ve Bina",
        description: "Sarf",
        tone: "bordo",
        weeks,
        resources: [],
      }).weeks?.[0]?.lessons?.[0]?.kaynak;
    };
    expect(sent("Bina · s. 4-9")).toBe("Bina · s. 4-9");
    expect(sent("  Bina · s. 10-15 ")).toBe("Bina · s. 10-15");
    // tedrisat leaves a missing key alone; only null clears the column.
    expect(sent("")).toBeNull();
    expect(sent("   ")).toBeNull();
  });
});

describe("Bağlı kaynaklar, as links (MDRS-279)", () => {
  const course = {
    id: "c1",
    version: 4,
    timeZone: "Europe/Istanbul",
    title: "Emsile ve Bina",
    description: null,
    coverHue: 20,
    muderris: [],
    weeks: [],
    resources: [
      {
        id: "r1",
        name: "Bina",
        meta: "PDF · 124 sayfa",
        type: "pdf",
        url: "https://files.medaris.org/bina.pdf",
      },
      { id: "r2", name: "Emsile", meta: null, type: null, url: null },
    ],
  } as unknown as CourseDetailResponse;
  const row = (over: Partial<ResourceDraft> = {}): ResourceDraft => ({
    ...emptyResource(),
    name: "Tatbikat",
    url: "https://files.medaris.org/tatbikat.pdf",
    ...over,
  });
  const edit = (resources: ResourceDraft[]) => ({
    title: "Emsile ve Bina",
    description: "",
    tone: "bordo" as const,
    weeks: [],
    resources,
  });

  it("reads the stored rows as drafts, keeping their id and type; a new row is a link", () => {
    expect(resourceDraftsOf(course)).toEqual([
      {
        id: "r1",
        name: "Bina",
        meta: "PDF · 124 sayfa",
        url: "https://files.medaris.org/bina.pdf",
        type: "pdf",
        urlRequired: true,
      },
      // stored without an address: an empty one does not stop Kaydet
      {
        id: "r2",
        name: "Emsile",
        meta: "",
        url: "",
        type: null,
        urlRequired: false,
      },
    ]);
    expect(emptyResource()).toEqual({
      name: "",
      meta: "",
      url: "",
      type: "link",
      urlRequired: true,
    });
  });

  it("stops Kaydet for a row without a name or an absolute http(s) address", () => {
    expect(
      curriculumErrors(
        "Emsile",
        [],
        [row(), row({ url: "http://emsile.test" })]
      )
    ).toEqual([]);
    expect(
      curriculumErrors(
        "Emsile",
        [],
        [
          row({ name: " " }),
          row({ url: "" }),
          row({ url: "javascript:alert(1)" }),
          row({ url: "emsile.test/kitap" }),
        ]
      )
    ).toEqual([
      { kind: "resourceName", resourceIndex: 0 },
      { kind: "resourceUrl", resourceIndex: 1 },
      { kind: "resourceUrl", resourceIndex: 2 },
      { kind: "resourceUrl", resourceIndex: 3 },
    ]);
  });

  it("is dirty when a row is added, changed or removed", () => {
    const saved = edit(resourceDraftsOf(course));
    expect(curriculumDirty(edit(resourceDraftsOf(course)), saved)).toBe(false);
    expect(
      curriculumDirty(edit([...resourceDraftsOf(course), row()]), saved)
    ).toBe(true);
    expect(
      curriculumDirty(edit(resourceDraftsOf(course).slice(1)), saved)
    ).toBe(true);
  });

  it("sends the rows in list order, existing ones with their id, trimmed, an emptied line as null", () => {
    const [bina, emsile] = resourceDraftsOf(course) as [
      ResourceDraft,
      ResourceDraft,
    ];
    const body = curriculumPayload(
      course,
      edit([
        { ...emsile, url: " https://emsile.test/ " },
        row({ name: " Tatbikat ", meta: " Doküman " }),
        { ...bina, meta: "" },
      ])
    );
    expect(body.resources).toEqual([
      {
        id: "r2",
        name: "Emsile",
        meta: null,
        type: undefined,
        url: "https://emsile.test/",
      },
      {
        name: "Tatbikat",
        meta: "Doküman",
        type: "link",
        url: "https://files.medaris.org/tatbikat.pdf",
      },
      {
        id: "r1",
        name: "Bina",
        meta: null,
        type: "pdf",
        url: "https://files.medaris.org/bina.pdf",
      },
    ]);
    // A row taken out of the form is not sent, so tedrisat removes it.
    expect(curriculumPayload(course, edit([])).resources).toEqual([]);
  });
});

describe("what a save keeps (MDRS-279)", () => {
  const lesson = {
    id: "l1",
    weekId: "w1",
    title: "Birinci",
    type: "LIVE",
    durationMinutes: 60,
    scheduledAt: "2026-10-03T18:00:00.000Z",
    isPreview: false,
    orderIndex: 0,
    cancelledAt: null,
    replacementLessonId: null,
  };
  const base = {
    id: "c1",
    version: 4,
    timeZone: "Europe/Istanbul",
    title: "Emsile ve Bina",
    description: null,
    coverHue: 20,
    muderris: [],
    weeks: [{ id: "w1", weekNumber: 1, title: "Birinci", lessons: [lesson] }],
  };
  // The body a content-locked read carries: no kaynak, agenda, link or url.
  const locked = {
    ...base,
    contentLocked: true,
    resources: [
      { id: "r1", name: "Bina", meta: "PDF · 124 sayfa", type: "pdf" },
    ],
  } as unknown as CourseDetailResponse;
  const save = (course: CourseDetailResponse, resources: ResourceDraft[]) =>
    curriculumPayload(course, {
      title: "Emsile ve Bina",
      description: "",
      tone: "bordo",
      weeks: weekDraftsOf(course),
      resources,
    });

  it("leaves out the kaynak, agenda and empty link of a content-locked read, so tedrisat keeps them", () => {
    const sent = save(locked, resourceDraftsOf(locked)).weeks?.[0]
      ?.lessons?.[0];
    expect(sent).toMatchObject({ id: "l1", title: "Birinci" });
    expect(Object.keys(sent ?? {})).not.toContain("kaynak");
    expect(Object.keys(sent ?? {})).not.toContain("agenda");
    expect(Object.keys(sent ?? {})).not.toContain("meetingUrl");
    // A link such a caller types is still sent.
    const weeks = weekDraftsOf(locked);
    (weeks[0]?.lessons[0] as LessonDraft).meetingUrl = "https://zoom.us/j/9";
    const typed = curriculumPayload(locked, {
      title: "Emsile ve Bina",
      description: "",
      tone: "bordo",
      weeks,
      resources: resourceDraftsOf(locked),
    }).weeks?.[0]?.lessons?.[0];
    expect(typed?.meetingUrl).toBe("https://zoom.us/j/9");
    expect(Object.keys(typed ?? {})).not.toContain("kaynak");
  });

  it("saves a content-locked read with its resources as they are, their urls left out", () => {
    const drafts = resourceDraftsOf(locked);
    expect(drafts[0]?.urlRequired).toBe(false);
    expect(curriculumErrors("Emsile ve Bina", [], drafts)).toEqual([]);
    expect(save(locked, drafts).resources).toEqual([
      { id: "r1", name: "Bina", meta: "PDF · 124 sayfa", type: "pdf" },
    ]);
  });

  it("does not let a row stored without an address stop Kaydet, and sends it without one", () => {
    const legacy = {
      ...base,
      contentLocked: false,
      resources: [
        { id: "r2", name: "Emsile", meta: null, type: null, url: null },
      ],
    } as unknown as CourseDetailResponse;
    const drafts = resourceDraftsOf(legacy);
    expect(curriculumErrors("Emsile ve Bina", [], drafts)).toEqual([]);
    expect(save(legacy, drafts).resources).toEqual([
      { id: "r2", name: "Emsile", meta: null, type: undefined },
    ]);
    // An address typed into it is checked; a new row still needs one.
    expect(
      curriculumErrors(
        "Emsile ve Bina",
        [],
        [
          { ...(drafts[0] as ResourceDraft), url: "emsile.pdf" },
          { ...emptyResource(), name: "Tatbikat" },
        ]
      )
    ).toEqual([
      { kind: "resourceUrl", resourceIndex: 0 },
      { kind: "resourceUrl", resourceIndex: 1 },
    ]);
  });
});

describe("a session's own resources (MDRS-286)", () => {
  const stored = [
    {
      id: "lr1",
      lessonId: "l1",
      name: "Emsile şerhi",
      meta: "PDF · 12 sayfa",
      url: "https://drive.google.com/file/d/1a2b3c/view",
      orderIndex: 0,
    },
    {
      id: "lr2",
      lessonId: "l1",
      name: "Tatbikat",
      meta: null,
      url: "https://files.medaris.org/tatbikat.pdf",
      orderIndex: 1,
    },
  ];
  const lesson = (over: Record<string, unknown> = {}) => ({
    id: "l1",
    weekId: "w1",
    title: "Birinci",
    type: "LIVE",
    durationMinutes: 60,
    scheduledAt: "2026-10-03T18:00:00.000Z",
    meetingUrl: "https://zoom.us/j/1",
    kaynak: "Bina",
    agenda: [],
    isPreview: false,
    orderIndex: 0,
    cancelledAt: null,
    replacementLessonId: null,
    resources: stored,
    ...over,
  });
  const course = (over: Record<string, unknown> = {}) =>
    ({
      id: "c1",
      version: 4,
      timeZone: "Europe/Istanbul",
      title: "Emsile ve Bina",
      description: null,
      coverHue: 20,
      contentLocked: false,
      muderris: [],
      resources: [],
      weeks: [
        {
          id: "w1",
          weekNumber: 1,
          title: "Birinci",
          lessons: [lesson(), lesson({ id: "l2", resources: [] })],
        },
      ],
      ...over,
    }) as unknown as CourseDetailResponse;
  const save = (read: CourseDetailResponse, weeks: WeekDraft[]) =>
    curriculumPayload(read, {
      title: "Emsile ve Bina",
      description: "",
      tone: "bordo",
      weeks,
      resources: [],
    }).weeks?.[0]?.lessons ?? [];
  /** The first session's drafts, changed by `change`. */
  const edited = (
    change: (rows: LessonResourceDraft[]) => LessonResourceDraft[],
    read = course()
  ) => {
    const weeks = weekDraftsOf(read);
    const first = weeks[0]?.lessons[0] as LessonDraft;
    first.resources = change(first.resources);
    return save(read, weeks);
  };

  it("reads a session's links as drafts, in order, keeping their ids", () => {
    expect(weekDraftsOf(course())[0]?.lessons[0]?.resources).toEqual([
      {
        id: "lr1",
        name: "Emsile şerhi",
        meta: "PDF · 12 sayfa",
        url: "https://drive.google.com/file/d/1a2b3c/view",
        urlRequired: true,
      },
      {
        id: "lr2",
        name: "Tatbikat",
        meta: "",
        url: "https://files.medaris.org/tatbikat.pdf",
        urlRequired: true,
      },
    ]);
    // a content-locked read carries no address: nothing to require
    expect(
      lessonResourceDraftsOf({
        resources: [{ ...stored[0], url: undefined }],
      } as never)
    ).toEqual([
      {
        id: "lr1",
        name: "Emsile şerhi",
        meta: "PDF · 12 sayfa",
        url: "",
        urlRequired: false,
      },
    ]);
  });

  it("does not copy them with the week: the copies are new sessions with no links", () => {
    const copy = copyWeek(weekDraftsOf(course())[0] as WeekDraft, 2);
    expect(copy.lessons.map((l) => l.resources)).toEqual([[], []]);
  });

  it("moves a row up or down, and leaves the rows alone out of range", () => {
    expect(moveRow(["a", "b", "c"], 2, 1)).toEqual(["a", "c", "b"]);
    expect(moveRow(["a", "b", "c"], 0, 1)).toEqual(["b", "a", "c"]);
    expect(moveRow(["a", "b"], 0, -1)).toEqual(["a", "b"]);
    expect(moveRow(["a", "b"], 1, 2)).toEqual(["a", "b"]);
  });

  it("stops Kaydet for a row without a name or an absolute http(s) address, naming its session", () => {
    const weeks = weekDraftsOf(course());
    const second = weeks[0]?.lessons[1] as LessonDraft;
    second.resources = [
      { ...emptyLessonResource(), url: "https://a.test/" },
      { ...emptyLessonResource(), name: "Bina", url: "" },
      { ...emptyLessonResource(), name: "Bina", url: "javascript:alert(1)" },
      { ...emptyLessonResource(), name: "Bina", url: "drive.google.com/x" },
    ];
    const at = { weekIndex: 0, lessonIndex: 1 };
    expect(curriculumErrors("Emsile ve Bina", weeks)).toEqual([
      { kind: "lessonResourceName", ...at, resourceIndex: 0 },
      { kind: "lessonResourceUrl", ...at, resourceIndex: 1 },
      { kind: "lessonResourceUrl", ...at, resourceIndex: 2 },
      { kind: "lessonResourceUrl", ...at, resourceIndex: 3 },
    ]);
    // not on a cancelled session, which is information
    second.cancelledAt = "2026-10-03T05:40:00.000Z";
    expect(curriculumErrors("Emsile ve Bina", weeks)).toEqual([]);
  });

  it("lets a content-locked read's rows through: they are not edited", () => {
    const locked = course({
      contentLocked: true,
      weeks: [
        {
          id: "w1",
          weekNumber: 1,
          title: "Birinci",
          lessons: [
            lesson({
              meetingUrl: undefined,
              kaynak: undefined,
              agenda: undefined,
              resources: stored.map(({ url: _url, ...row }) => row),
            }),
          ],
        },
      ],
    });
    const weeks = weekDraftsOf(locked);
    expect(curriculumErrors("Emsile ve Bina", weeks)).toEqual([]);
    expect(Object.keys(save(locked, weeks)[0] ?? {})).not.toContain(
      "resources"
    );
  });

  it("sends no session's list the form left as read, so tedrisat keeps it", () => {
    const lessons = save(course(), weekDraftsOf(course()));
    expect(lessons.map((l) => l.id)).toEqual(["l1", "l2"]);
    for (const l of lessons) expect(Object.keys(l)).not.toContain("resources");
  });

  it("sends a changed list whole, in its order, the kept rows with their ids, trimmed, an empty line as null", () => {
    const [first] = edited((rows) => [
      { ...(rows[1] as LessonResourceDraft), name: " Tatbikat defteri " },
      rows[0] as LessonResourceDraft,
      {
        ...emptyLessonResource(),
        name: " Bina ",
        meta: "  ",
        url: " https://files.medaris.org/bina.pdf ",
      },
    ]);
    expect(first?.resources).toEqual([
      {
        id: "lr2",
        name: "Tatbikat defteri",
        meta: null,
        url: "https://files.medaris.org/tatbikat.pdf",
      },
      {
        id: "lr1",
        name: "Emsile şerhi",
        meta: "PDF · 12 sayfa",
        url: "https://drive.google.com/file/d/1a2b3c/view",
      },
      { name: "Bina", meta: null, url: "https://files.medaris.org/bina.pdf" },
    ]);
  });

  it("sends a reordered list, and an empty one when every row is removed", () => {
    expect(
      edited((rows) => moveRow(rows, 1, 0))[0]?.resources?.map((r) => r.id)
    ).toEqual(["lr2", "lr1"]);
    expect(edited(() => [])[0]?.resources).toEqual([]);
  });

  it("sends a new session's links, and nothing for one without", () => {
    const read = course();
    const weeks = weekDraftsOf(read);
    (weeks[0] as WeekDraft).lessons.push(
      {
        ...(weeks[0]?.lessons[1] as LessonDraft),
        id: undefined,
        resources: [
          {
            ...emptyLessonResource(),
            name: "Emsile",
            url: "https://emsile.test/",
          },
        ],
      },
      { ...(weeks[0]?.lessons[1] as LessonDraft), id: undefined }
    );
    const [, , added, bare] = save(read, weeks);
    expect(added?.resources).toEqual([
      { name: "Emsile", meta: null, url: "https://emsile.test/" },
    ]);
    expect(Object.keys(bare ?? {})).not.toContain("resources");
  });

  it("makes the form dirty when a session's row changes", () => {
    const form = (weeks: WeekDraft[]) => ({
      title: "Emsile ve Bina",
      description: "",
      tone: "bordo",
      weeks,
      resources: [],
    });
    const saved = form(weekDraftsOf(course()));
    const weeks = weekDraftsOf(course());
    expect(curriculumDirty(form(weeks), saved)).toBe(false);
    const first = weeks[0]?.lessons[0] as LessonDraft;
    first.resources = moveRow(first.resources, 0, 1);
    expect(curriculumDirty(form(weeks), saved)).toBe(true);
  });
});

describe("how a session is attended (MDRS-283)", () => {
  const now = new Date("2026-10-03T18:14:00Z");
  const lesson = (id: string, at: string, extra: Record<string, unknown>) => ({
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
  });
  const read = (...lessons: ReturnType<typeof lesson>[]) =>
    ({
      id: "c1",
      version: 2,
      title: "Emsile ve Bina",
      timeZone: "Europe/Istanbul",
      inPerson: false,
      muderris: [],
      resources: [],
      weeks: [{ id: "w", weekNumber: 1, title: "Bir", lessons }],
    }) as unknown as CourseDetailResponse;
  const facts = {
    inPerson: false,
    inPersonOverride: null,
    hasLiveStream: false,
  };

  it("reads each session's stream and in-person mark off the course, and nothing off a content-locked read", () => {
    const [streamed, own, locked] = sessionRows(
      read(
        lesson("s", "2026-10-07T18:00:00Z", { ...facts, hasLiveStream: true }),
        lesson("o", "2026-10-08T18:00:00Z", {
          ...facts,
          inPerson: true,
          inPersonOverride: true,
        }),
        lesson("l", "2026-10-09T18:00:00Z", {})
      ),
      now
    );
    expect(streamed).toMatchObject({
      hasLiveStream: true,
      inPerson: false,
      inPersonOverride: null,
    });
    expect(own).toMatchObject({ inPerson: true, inPersonOverride: true });
    expect(locked).toMatchObject({
      hasLiveStream: false,
      inPerson: null,
      inPersonOverride: null,
    });
  });

  it("covers a session by its link, its stream or the in-person mark, and flags only a planned one with none", () => {
    const row = {
      meetingUrl: null,
      hasLiveStream: false,
      inPerson: false,
      state: "scheduled" as const,
    };
    expect(rowAttendance(row)).toEqual({
      inPerson: false,
      platform: null,
      stream: null,
      lack: "missing",
    });
    expect(rowAttendance({ ...row, hasLiveStream: true })).toMatchObject({
      stream: "alone",
      lack: null,
    });
    expect(rowAttendance({ ...row, inPerson: true })).toMatchObject({
      inPerson: true,
      lack: null,
    });
    expect(
      rowAttendance({ ...row, inPerson: true, hasLiveStream: true })
    ).toMatchObject({ inPerson: true, stream: "beside", lack: null });
    expect(
      rowAttendance({
        ...row,
        meetingUrl: "https://zoom.us/j/1",
        hasLiveStream: true,
      })
    ).toMatchObject({
      platform: { id: "zoom", host: "zoom.us" },
      stream: "beside",
      lack: null,
    });
    // a blank link is no link
    expect(rowAttendance({ ...row, meetingUrl: "  " })?.lack).toBe("missing");
  });

  it("does not flag a session that is under way or over, and claims nothing it was not told", () => {
    const row = { meetingUrl: null, hasLiveStream: false, inPerson: false };
    expect(rowAttendance({ ...row, state: "live" })?.lack).toBe("none");
    expect(rowAttendance({ ...row, state: "ended" })?.lack).toBe("none");
    expect(
      rowAttendance({ ...row, inPerson: null, state: "scheduled" })
    ).toBeNull();
  });

  it("maps the three answers of the in-person choice to the mark and back", () => {
    expect(inPersonChoiceOf(null)).toBe("course");
    expect(inPersonChoiceOf(true)).toBe("yes");
    expect(inPersonChoiceOf(false)).toBe("no");
    expect(inPersonOverrideOf("course")).toBeNull();
    expect(inPersonOverrideOf("yes")).toBe(true);
    expect(inPersonOverrideOf("no")).toBe(false);
  });

  it("keeps a session's attendance on its draft and never sends it, so the save leaves the stored mark", () => {
    const course = read(
      lesson("o", "2026-10-08T18:00:00Z", {
        ...facts,
        inPerson: true,
        inPersonOverride: true,
        hasLiveStream: true,
      }),
      lesson("l", "2026-10-09T18:00:00Z", {})
    );
    const weeks = weekDraftsOf(course);
    expect(weeks[0]?.lessons[0]?.attendance).toEqual({
      inPersonOverride: true,
      hasLiveStream: true,
    });
    expect(weeks[0]?.lessons[1]?.attendance).toBeNull();
    const sent = curriculumPayload(course, {
      title: "Emsile ve Bina",
      description: "",
      tone: "bordo",
      weeks,
      resources: [],
    }).weeks?.[0]?.lessons?.[0];
    expect(Object.keys(sent ?? {})).not.toContain("inPersonOverride");
    expect(Object.keys(sent ?? {})).not.toContain("attendance");
  });

  describe("Müfredat's flag and link help", () => {
    const zone = "Europe/Istanbul";
    const draft = (over: Partial<LessonDraft> = {}): LessonDraft => ({
      id: "l1",
      title: "Mehmûz fiiller",
      type: "LIVE",
      date: "2026-10-08",
      time: "21:00",
      duration: "60",
      meetingUrl: "",
      kaynak: "",
      agenda: [],
      isPreview: false,
      cancelledAt: null,
      cancelReason: null,
      scheduledAtIso: "2026-10-08T18:00:00.000Z",
      makeup: false,
      attendance: { inPersonOverride: null, hasLiveStream: false },
      resources: [],
      ...over,
    });
    const flagged = (over: Partial<LessonDraft>, courseInPerson = false) =>
      lessonWithoutAccess(draft(over), courseInPerson, zone, now);

    it("flags a live session still ahead with no link, no stream and not held in person", () => {
      expect(flagged({})).toBe(true);
      expect(flagged({ meetingUrl: "zoom.us/j/1" })).toBe(false);
      expect(
        flagged({ attendance: { inPersonOverride: null, hasLiveStream: true } })
      ).toBe(false);
      expect(flagged({}, true)).toBe(false);
      expect(
        flagged({
          attendance: { inPersonOverride: true, hasLiveStream: false },
        })
      ).toBe(false);
      // taken out of an in-person course, with nothing else
      expect(
        flagged(
          { attendance: { inPersonOverride: false, hasLiveStream: false } },
          true
        )
      ).toBe(true);
    });

    it("does not flag one that is under way, over, cancelled, not live, undated or not judged", () => {
      expect(flagged({ date: "2026-10-03", time: "21:00" })).toBe(false);
      expect(flagged({ date: "2026-09-26" })).toBe(false);
      expect(flagged({ cancelledAt: "2026-10-03T05:40:00.000Z" })).toBe(false);
      expect(flagged({ type: "VIDEO" })).toBe(false);
      expect(flagged({ date: "" })).toBe(false);
      expect(flagged({ attendance: null })).toBe(false);
    });

    it("says a link is needed only where nothing else lets the talebe in", () => {
      expect(linkHelpKey(draft(), false)).toBe("linkHelp");
      expect(
        linkHelpKey(draft({ meetingUrl: "https://zoom.us/j/1" }), false)
      ).toBe("linkHelpFilled");
      expect(linkHelpKey(draft(), true)).toBe("linkHelpInPerson");
      expect(
        linkHelpKey(
          draft({
            attendance: { inPersonOverride: true, hasLiveStream: true },
          }),
          false
        )
      ).toBe("linkHelpInPerson");
      expect(
        linkHelpKey(
          draft({
            attendance: { inPersonOverride: null, hasLiveStream: true },
          }),
          false
        )
      ).toBe("linkHelpStream");
      expect(linkHelpKey(draft({ attendance: null }), false)).toBe(
        "linkHelpFilled"
      );
    });
  });

  it("reads and sends 'Celseler yüz yüze yapılır' with the other settings, only when it changed", () => {
    const stored = settingsOf({
      isClosed: false,
      requiresApproval: true,
      inPerson: false,
      timeZone: "Europe/Istanbul",
      weeks: [],
    });
    expect(stored.inPerson).toBe(false);
    expect(settingsPatch(stored, stored)).toBeNull();
    expect(settingsPatch({ ...stored, inPerson: true }, stored)).toEqual({
      inPerson: true,
    });
    expect(
      settingsPatch(
        { ...stored, isClosed: true, timeZone: "Europe/Berlin" },
        stored
      )
    ).toEqual({ isClosed: true, timeZone: "Europe/Berlin" });
    expect(settingsOf({ ...stored, inPerson: true, weeks: [] }).inPerson).toBe(
      true
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
