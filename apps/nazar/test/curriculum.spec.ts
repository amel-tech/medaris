import type { CourseDetailResponse } from "@medaris/services/tedrisat";
import { describe, expect, it } from "vitest";
import {
  type CurriculumForm,
  copyWeek,
  curriculumConflict,
  curriculumDirty,
  curriculumErrorKey,
  curriculumErrors,
  curriculumHref,
  curriculumPayload,
  dayLabel,
  emptyLesson,
  headingDay,
  type LessonDraft,
  lessonDraftOf,
  nextWeekNumber,
  type WeekDraft,
  weekDraftsOf,
  weekFacts,
} from "~/features/curriculum/curriculum";

/**
 * Müfredat's rules: the drafts a course becomes, what stops "Kaydet", the
 * body of the whole-course save, and the sentence a refusal gets.
 */
const ZONE = "Europe/Istanbul";

const lesson = (over: Record<string, unknown> = {}) => ({
  id: "l-1",
  weekId: "w-1",
  title: "Hafta 1",
  type: "LIVE",
  scheduledAt: new Date("2026-10-05T18:00:00Z"),
  durationMinutes: 60,
  isPreview: false,
  orderIndex: 0,
  meetingUrl: "https://zoom.us/j/123456",
  kaynak: "Kitap",
  agenda: [{ time: "21:00", title: "Giriş" }],
  cancelledAt: null,
  cancelReason: null,
  replacementLessonId: null,
  ...over,
});

const course = (over: Record<string, unknown> = {}) =>
  ({
    id: "c-1",
    title: "Bina ve İzhar",
    description: "Tanıtım",
    coverHue: 25,
    version: 7,
    timeZone: ZONE,
    weeks: [
      {
        id: "w-1",
        weekNumber: 1,
        title: "Birinci",
        summary: "Özet",
        lessons: [lesson()],
      },
    ],
    muderris: [
      {
        id: "m-1",
        userId: "u-1",
        name: "Ahmed",
        title: "Müderris",
        bio: null,
        avatarHue: 10,
      },
    ],
    resources: [
      { id: "r-1", name: "Kitap", meta: null, type: "PDF", url: null },
    ],
    ...over,
  }) as unknown as CourseDetailResponse;

const form = (over: Partial<CurriculumForm> = {}): CurriculumForm => ({
  title: "Bina ve İzhar",
  description: "Tanıtım",
  tone: "laciverd",
  weeks: weekDraftsOf(course(), ZONE),
  ...over,
});

const draft = (over: Partial<LessonDraft> = {}): LessonDraft => ({
  ...emptyLesson("2026-10-12"),
  title: "Hafta 2",
  ...over,
});

const week = (lessons: LessonDraft[], over: Partial<WeekDraft> = {}) => ({
  weekNumber: 2,
  title: "İkinci",
  summary: "",
  lessons,
  ...over,
});

describe("the address", () => {
  it("is the course's müfredat, encoded", () => {
    expect(curriculumHref("c 1")).toBe("/ders/c%201/mufredat");
  });
});

describe("the drafts of a course", () => {
  it("write a session's date and time on the zone they are given", () => {
    const istanbul = lessonDraftOf(lesson() as never, ZONE);
    expect(istanbul).toMatchObject({ date: "2026-10-05", time: "21:00" });
    const berlin = lessonDraftOf(lesson() as never, "Europe/Berlin");
    expect(berlin).toMatchObject({ date: "2026-10-05", time: "20:00" });
  });

  it("keep everything the form does not edit, and the stored instant", () => {
    expect(lessonDraftOf(lesson() as never, ZONE)).toMatchObject({
      id: "l-1",
      type: "LIVE",
      duration: "60",
      meetingUrl: "https://zoom.us/j/123456",
      kaynak: "Kitap",
      agenda: [{ time: "21:00", title: "Giriş" }],
      scheduledAtIso: "2026-10-05T18:00:00.000Z",
      cancelledAt: null,
    });
  });

  it("read a session with no time and no length as empty fields", () => {
    expect(
      lessonDraftOf(
        lesson({
          scheduledAt: null,
          durationMinutes: null,
          meetingUrl: null,
        }) as never,
        ZONE
      )
    ).toMatchObject({
      date: "",
      time: "",
      duration: "",
      meetingUrl: "",
      scheduledAtIso: null,
    });
  });

  it("mark the session that makes up for a cancelled one", () => {
    const weeks = weekDraftsOf(
      course({
        weeks: [
          {
            id: "w-1",
            weekNumber: 1,
            title: "Birinci",
            lessons: [
              lesson({
                id: "l-1",
                cancelledAt: new Date("2026-10-01T09:00:00Z"),
                replacementLessonId: "l-2",
              }),
              lesson({ id: "l-2" }),
            ],
          },
        ],
      }),
      ZONE
    );
    expect(weeks[0]?.lessons.map((l) => l.makeup)).toEqual([false, true]);
  });
});

describe("a new session and a new week", () => {
  it("starts at 21:00 for 60 minutes, live, on the date it is given", () => {
    expect(emptyLesson("2026-10-12")).toMatchObject({
      type: "LIVE",
      date: "2026-10-12",
      time: "21:00",
      duration: "60",
      meetingUrl: "",
      cancelledAt: null,
    });
  });

  it("numbers a new week after the highest one", () => {
    expect(nextWeekNumber([])).toBe(1);
    expect(nextWeekNumber([week([], { weekNumber: 3 }), week([])])).toBe(4);
  });

  it("copies a week a week later, with no ids, no links and nothing cancelled", () => {
    const copy = copyWeek(
      {
        id: "w-1",
        weekNumber: 1,
        title: "Birinci",
        summary: "Özet",
        lessons: [
          draft({ id: "l-1", date: "2026-10-05", meetingUrl: "https://a.b/c" }),
          draft({ id: "l-2", cancelledAt: "2026-10-01T00:00:00.000Z" }),
        ],
      },
      5
    );
    expect(copy.id).toBeUndefined();
    expect(copy.weekNumber).toBe(5);
    expect(copy.lessons).toHaveLength(1);
    expect(copy.lessons[0]).toMatchObject({
      id: undefined,
      date: "2026-10-12",
      meetingUrl: "",
      scheduledAtIso: null,
    });
  });
});

describe("weekFacts and curriculumDirty", () => {
  it("count a week's live sessions and minutes and give its span", () => {
    expect(
      weekFacts(
        week([
          draft({ date: "2026-10-14", duration: "45" }),
          draft({ date: "2026-10-12", duration: "60" }),
          draft({ date: "2026-10-13", cancelledAt: "2026-10-01T00:00:00Z" }),
        ])
      )
    ).toEqual({
      sessions: 2,
      minutes: 105,
      from: "2026-10-12",
      to: "2026-10-14",
    });
    expect(weekFacts(week([]))).toEqual({
      sessions: 0,
      minutes: 0,
      from: null,
      to: null,
    });
  });

  it("is dirty only when the form differs from the saved one", () => {
    expect(curriculumDirty(form(), form())).toBe(false);
    expect(curriculumDirty(form({ title: "Başka" }), form())).toBe(true);
    expect(curriculumDirty(form({ tone: "bordo" }), form())).toBe(true);
  });
});

describe("what stops Kaydet", () => {
  it("lets a complete form through", () => {
    expect(curriculumErrors("Bina ve İzhar", form().weeks)).toEqual([]);
  });

  it("names the course, the week and each field of a live session", () => {
    const errors = curriculumErrors("a", [
      week(
        [
          draft({
            title: " ",
            date: "",
            time: "",
            duration: "0",
            meetingUrl: "http://zoom.us/j/1",
          }),
        ],
        { title: " " }
      ),
    ]);
    expect(errors.map((e) => e.kind).sort()).toEqual(
      [
        "title",
        "weekTitle",
        "lessonTitle",
        "lessonDate",
        "lessonTime",
        "lessonDuration",
        "link",
      ].sort()
    );
    expect(errors.find((e) => e.kind === "link")).toMatchObject({
      weekIndex: 0,
      lessonIndex: 0,
    });
  });

  it("takes an empty link (it is added later) and a link without a scheme", () => {
    expect(
      curriculumErrors("Ders", [
        week([draft({ meetingUrl: "" }), draft({ meetingUrl: "zoom.us/j/1" })]),
      ])
    ).toEqual([]);
  });

  it("does not check a cancelled session or the fields of a lesson that is not live", () => {
    expect(
      curriculumErrors("Ders", [
        week([
          draft({ title: "", cancelledAt: "2026-10-01T00:00:00Z", date: "" }),
          draft({ type: "VIDEO", date: "", time: "", duration: "" }),
        ]),
      ])
    ).toEqual([]);
  });
});

describe("the whole-course body of Kaydet", () => {
  it("carries the version the page was read at and the müderris and the resources unchanged", () => {
    const body = curriculumPayload(course(), form(), ZONE);
    expect(body.version).toBe(7);
    expect(body.title).toBe("Bina ve İzhar");
    expect(body.muderris).toEqual([
      {
        id: "m-1",
        userId: "u-1",
        name: "Ahmed",
        title: "Müderris",
        bio: undefined,
        avatarHue: 10,
      },
    ]);
    expect(body.resources).toEqual([
      {
        id: "r-1",
        name: "Kitap",
        meta: undefined,
        type: "PDF",
        url: undefined,
      },
    ]);
  });

  it("keeps a session's id and the stored instant when its date and time were not touched", () => {
    const seconds = new Date("2026-10-05T18:00:42Z");
    const source = course({
      weeks: [
        {
          id: "w-1",
          weekNumber: 1,
          title: "Birinci",
          lessons: [lesson({ scheduledAt: seconds })],
        },
      ],
    });
    const body = curriculumPayload(
      source,
      form({ weeks: weekDraftsOf(source, ZONE) }),
      ZONE
    );
    const sent = body.weeks?.[0]?.lessons?.[0];
    expect(sent?.id).toBe("l-1");
    expect(sent?.scheduledAt).toEqual(seconds);
  });

  it("sends the instant a changed date and time mean on the page's zone", () => {
    const weeks = weekDraftsOf(course(), ZONE);
    const first = weeks[0]?.lessons[0] as LessonDraft;
    first.date = "2026-10-12";
    first.time = "20:30";
    const istanbul = curriculumPayload(course(), form({ weeks }), ZONE);
    expect(istanbul.weeks?.[0]?.lessons?.[0]?.scheduledAt).toEqual(
      new Date("2026-10-12T17:30:00Z")
    );
    const berlin = curriculumPayload(
      course(),
      form({ weeks }),
      "Europe/Berlin"
    );
    expect(berlin.weeks?.[0]?.lessons?.[0]?.scheduledAt).toEqual(
      new Date("2026-10-12T18:30:00Z")
    );
  });

  it("normalises the meeting link and sends null for an emptied one, so tedrisat clears it", () => {
    const weeks = weekDraftsOf(course(), ZONE);
    const first = weeks[0]?.lessons[0] as LessonDraft;
    first.meetingUrl = "  zoom.us/j/999 ";
    expect(
      curriculumPayload(course(), form({ weeks }), ZONE).weeks?.[0]
        ?.lessons?.[0]?.meetingUrl
    ).toBe("https://zoom.us/j/999");
    first.meetingUrl = "";
    expect(
      curriculumPayload(course(), form({ weeks }), ZONE).weeks?.[0]
        ?.lessons?.[0]?.meetingUrl
    ).toBeNull();
  });

  it("sends a session's kaynak trimmed, and null for an emptied one, so tedrisat clears it (MDRS-279)", () => {
    const weeks = weekDraftsOf(course(), ZONE);
    const first = weeks[0]?.lessons[0] as LessonDraft;
    const sent = () =>
      curriculumPayload(course(), form({ weeks }), ZONE).weeks?.[0]
        ?.lessons?.[0]?.kaynak;
    expect(sent()).toBe("Kitap");
    first.kaynak = "  Bina · s. 4-9 ";
    expect(sent()).toBe("Bina · s. 4-9");
    first.kaynak = "";
    expect(sent()).toBeNull();
    first.kaynak = "   ";
    expect(sent()).toBeNull();
  });

  it("sends a cancelled session as it is stored, and a new week and session without ids", () => {
    const source = course({
      weeks: [
        {
          id: "w-1",
          weekNumber: 1,
          title: "Birinci",
          lessons: [lesson({ cancelledAt: new Date("2026-10-01T09:00:00Z") })],
        },
      ],
    });
    const weeks = [
      ...weekDraftsOf(source, ZONE),
      week([draft({ date: "2026-10-12", time: "21:00" })]),
    ];
    const body = curriculumPayload(source, form({ weeks }), ZONE);
    expect(body.weeks?.[0]?.lessons?.[0]?.scheduledAt).toEqual(
      new Date("2026-10-05T18:00:00Z")
    );
    expect(body.weeks?.[1]).not.toHaveProperty("id");
    expect(body.weeks?.[1]?.lessons?.[0]).not.toHaveProperty("id");
  });

  it("leaves a week or a session out when the form has taken it out", () => {
    const body = curriculumPayload(course(), form({ weeks: [] }), ZONE);
    expect(body.weeks).toEqual([]);
  });

  it("sends the cover hue of the chosen tone, and no description when it is blank", () => {
    const body = curriculumPayload(
      course(),
      form({ tone: "bordo", description: "  " }),
      ZONE
    );
    expect(body.coverHue).toEqual(expect.any(Number));
    expect(body.coverHue).not.toBe(
      curriculumPayload(course(), form({ tone: "zumrut" }), ZONE).coverHue
    );
    expect(body.description).toBeUndefined();
  });
});

describe("dates", () => {
  it("name a day and a session's heading in the page's language", () => {
    expect(dayLabel("tr", "2026-10-12", false)).toBe("12 Ekim");
    expect(dayLabel("tr", "2026-10-12", true)).toBe("12 Ekim 2026");
    expect(headingDay("tr", "2026-10-12")).toBe("12 Eki Pzt");
  });
});

describe("what the API refuses", () => {
  it("words a refusal from its code, and a stale save as a conflict", () => {
    expect(curriculumErrorKey("AUTHZ_FORBIDDEN")).toBe(
      "Problems.actionForbidden"
    );
    expect(curriculumErrorKey("COURSE_VERSION_CONFLICT")).toBe(
      "Problems.actionGeneric"
    );
    expect(curriculumErrorKey("")).toBe("Problems.actionGeneric");
    expect(curriculumConflict("COURSE_VERSION_CONFLICT")).toBe(true);
    expect(curriculumConflict("AUTHZ_FORBIDDEN")).toBe(false);
  });
});
