import type { CourseDetailResponse } from "@medaris/services/tedrisat";
import { describe, expect, it } from "vitest";
import {
  type CurriculumForm,
  copyWeek,
  courseAfterLessonUpload,
  courseAfterUpload,
  curriculumConflict,
  curriculumDirty,
  curriculumErrorKey,
  curriculumErrors,
  curriculumHref,
  curriculumPayload,
  dayLabel,
  emptyLesson,
  emptyLessonResource,
  emptyResource,
  headingDay,
  type LessonDraft,
  type LessonResourceDraft,
  lessonDraftOf,
  lessonResourceDraftOf,
  lessonResourceDraftsOf,
  lessonWithoutAccess,
  linkHelpKey,
  moveRow,
  nextWeekNumber,
  type ResourceDraft,
  resourceDraftOf,
  resourceDraftsOf,
  versionAfterUpload,
  type WeekDraft,
  weekDraftsOf,
  weekFacts,
  withLessonResource,
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
  inPerson: false,
  inPersonOverride: null,
  hasLiveStream: false,
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
    inPerson: false,
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
  resources: resourceDraftsOf(course()),
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

describe("how a session is attended (MDRS-283)", () => {
  const NOW = new Date("2026-10-02T12:00:00Z");
  /** A live session on 12 Ekim with nothing: no link, no stream, not in person. */
  const bare = (over: Partial<LessonDraft> = {}) =>
    draft({ meetingUrl: "", ...over });
  const flagged = (d: LessonDraft, courseInPerson = false, now = NOW) =>
    lessonWithoutAccess(d, courseInPerson, ZONE, now);

  it("is read off the course: the session's own mark and whether it is streamed", () => {
    expect(
      lessonDraftOf(
        lesson({
          inPersonOverride: true,
          inPerson: true,
          hasLiveStream: true,
        }) as never,
        ZONE
      ).attendance
    ).toEqual({ inPersonOverride: true, hasLiveStream: true });
  });

  it("is unknown for a content-locked read, which carries none", () => {
    expect(
      lessonDraftOf(
        lesson({
          meetingUrl: undefined,
          inPerson: undefined,
          inPersonOverride: undefined,
          hasLiveStream: undefined,
        }) as never,
        ZONE
      ).attendance
    ).toBeNull();
  });

  it("starts a new session, and every copy of one, following the course with no stream", () => {
    expect(emptyLesson("2026-10-12").attendance).toEqual({
      inPersonOverride: null,
      hasLiveStream: false,
    });
    const copy = copyWeek(
      week([
        draft({
          id: "l-1",
          attendance: { inPersonOverride: true, hasLiveStream: true },
        }),
      ]),
      3
    );
    expect(copy.lessons[0]?.attendance).toEqual({
      inPersonOverride: null,
      hasLiveStream: false,
    });
  });

  it("flags a live session still ahead with no link, no stream and not in person", () => {
    expect(flagged(bare())).toBe(true);
  });

  it("does not flag one that has any of the three", () => {
    expect(flagged(bare({ meetingUrl: "zoom.us/j/1" }))).toBe(false);
    expect(
      flagged(
        bare({ attendance: { inPersonOverride: null, hasLiveStream: true } })
      )
    ).toBe(false);
    expect(
      flagged(
        bare({ attendance: { inPersonOverride: true, hasLiveStream: false } })
      )
    ).toBe(false);
    // the course's mark, followed by a session without its own
    expect(flagged(bare(), true)).toBe(false);
  });

  it("flags one taken out of an in-person course when it has nothing else", () => {
    expect(
      flagged(
        bare({ attendance: { inPersonOverride: false, hasLiveStream: false } }),
        true
      )
    ).toBe(true);
  });

  it("does not flag one that has begun or is over, is cancelled, is not live or is not known", () => {
    expect(flagged(bare(), false, new Date("2026-10-12T18:30:00Z"))).toBe(
      false
    );
    expect(flagged(bare({ cancelledAt: "2026-10-01T00:00:00.000Z" }))).toBe(
      false
    );
    expect(flagged(bare({ type: "VIDEO" }))).toBe(false);
    expect(flagged(bare({ attendance: null }))).toBe(false);
    expect(flagged(bare({ date: "", time: "" }))).toBe(false);
  });

  it("asks for a link only where nothing else lets the talebe in", () => {
    expect(linkHelpKey(bare(), false)).toBe("Curriculum.linkHelp");
    expect(linkHelpKey(bare(), true)).toBe("Curriculum.linkHelpInPerson");
    expect(
      linkHelpKey(
        bare({ attendance: { inPersonOverride: true, hasLiveStream: true } }),
        false
      )
    ).toBe("Curriculum.linkHelpInPerson");
    expect(
      linkHelpKey(
        bare({ attendance: { inPersonOverride: null, hasLiveStream: true } }),
        false
      )
    ).toBe("Curriculum.linkHelpStream");
    expect(
      linkHelpKey(bare({ meetingUrl: "https://zoom.us/j/1" }), false)
    ).toBe("Curriculum.linkHelpFilled");
    expect(linkHelpKey(bare({ attendance: null }), false)).toBe(
      "Curriculum.linkHelpFilled"
    );
  });

  it("is never sent: the whole-course save leaves the marks as stored", () => {
    const body = curriculumPayload(course(), form(), ZONE);
    for (const lesson of body.weeks?.[0]?.lessons ?? []) {
      expect(lesson).not.toHaveProperty("inPersonOverride");
      expect(lesson).not.toHaveProperty("attendance");
    }
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
  it("carries the version the page was read at and the müderris unchanged", () => {
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

describe("the course's resources, as links (MDRS-279)", () => {
  const linked = (over: Record<string, unknown> = {}) =>
    course({
      resources: [
        {
          id: "r-1",
          name: "Bina",
          meta: "PDF · 124 sayfa",
          type: "pdf",
          url: "https://files.medaris.org/bina.pdf",
        },
        { id: "r-2", name: "Emsile", meta: null, type: null, url: null },
      ],
      ...over,
    });
  const row = (over: Partial<ResourceDraft> = {}): ResourceDraft => ({
    ...emptyResource(),
    name: "Tatbikat",
    url: "https://files.medaris.org/tatbikat.pdf",
    ...over,
  });

  it("read the stored rows as drafts, keeping their id and type", () => {
    expect(resourceDraftsOf(linked())).toEqual([
      {
        id: "r-1",
        name: "Bina",
        meta: "PDF · 124 sayfa",
        url: "https://files.medaris.org/bina.pdf",
        type: "pdf",
        urlRequired: true,
      },
      // stored without an address: an empty one does not stop Kaydet
      {
        id: "r-2",
        name: "Emsile",
        meta: "",
        url: "",
        type: null,
        urlRequired: false,
      },
    ]);
  });

  it("start a new row as an empty link", () => {
    expect(emptyResource()).toEqual({
      name: "",
      meta: "",
      url: "",
      type: "link",
      urlRequired: true,
    });
  });

  it("need a name and an absolute http(s) address, as tedrisat does", () => {
    expect(
      curriculumErrors(
        "Bina ve İzhar",
        [],
        [row(), row({ url: "http://emsile.test/" })]
      )
    ).toEqual([]);
    expect(
      curriculumErrors(
        "Bina ve İzhar",
        [],
        [
          row({ name: "  " }),
          row({ url: "" }),
          row({ url: "javascript:alert(1)" }),
          row({ url: "files.medaris.org/bina.pdf" }),
        ]
      )
    ).toEqual([
      { kind: "resourceName", resourceIndex: 0 },
      { kind: "resourceUrl", resourceIndex: 1 },
      { kind: "resourceUrl", resourceIndex: 2 },
      { kind: "resourceUrl", resourceIndex: 3 },
    ]);
  });

  it("make the form dirty when a row is added, changed or removed", () => {
    const saved = form({ resources: resourceDraftsOf(linked()) });
    const same = form({ resources: resourceDraftsOf(linked()) });
    expect(curriculumDirty(same, saved)).toBe(false);
    expect(
      curriculumDirty({ ...same, resources: [...same.resources, row()] }, saved)
    ).toBe(true);
    expect(
      curriculumDirty(
        {
          ...same,
          resources: [{ ...same.resources[0], meta: "" } as ResourceDraft],
        },
        saved
      )
    ).toBe(true);
  });

  it("are sent in list order, existing rows with their id, trimmed, an emptied line as null", () => {
    const [bina, emsile] = resourceDraftsOf(linked()) as [
      ResourceDraft,
      ResourceDraft,
    ];
    const body = curriculumPayload(
      linked(),
      form({
        resources: [
          { ...emsile, url: " https://emsile.test/ " },
          row({ name: " Tatbikat ", meta: " Doküman " }),
          { ...bina, meta: "" },
        ],
      }),
      ZONE
    );
    expect(body.resources).toEqual([
      {
        id: "r-2",
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
        id: "r-1",
        name: "Bina",
        meta: null,
        type: "pdf",
        url: "https://files.medaris.org/bina.pdf",
      },
    ]);
  });

  it("send no row the form has taken out: tedrisat removes it", () => {
    expect(
      curriculumPayload(linked(), form({ resources: [] }), ZONE).resources
    ).toEqual([]);
  });
});

describe("what a save keeps (MDRS-279)", () => {
  // The body a content-locked read carries: no kaynak, agenda, link or url.
  const locked = () =>
    course({
      contentLocked: true,
      weeks: [
        {
          id: "w-1",
          weekNumber: 1,
          title: "Birinci",
          summary: "Özet",
          lessons: [
            lesson({
              meetingUrl: undefined,
              kaynak: undefined,
              agenda: undefined,
            }),
          ],
        },
      ],
      resources: [
        { id: "r-1", name: "Kitap", meta: "PDF · 124 sayfa", type: "pdf" },
      ],
    });
  const lockedForm = () =>
    form({
      weeks: weekDraftsOf(locked(), ZONE),
      resources: resourceDraftsOf(locked()),
    });

  it("leaves out the kaynak, agenda and empty link of a content-locked read, so tedrisat keeps them", () => {
    const sent = curriculumPayload(locked(), lockedForm(), ZONE).weeks?.[0]
      ?.lessons?.[0];
    expect(sent).toMatchObject({ id: "l-1", title: "Hafta 1" });
    for (const key of ["kaynak", "agenda", "meetingUrl"]) {
      expect(Object.keys(sent ?? {})).not.toContain(key);
    }
    // A link such a caller types is still sent.
    const typed = lockedForm();
    (typed.weeks[0]?.lessons[0] as LessonDraft).meetingUrl = "zoom.us/j/9";
    expect(
      curriculumPayload(locked(), typed, ZONE).weeks?.[0]?.lessons?.[0]
        ?.meetingUrl
    ).toBe("https://zoom.us/j/9");
  });

  it("saves a content-locked read with its resources as they are, their urls left out", () => {
    expect(resourceDraftsOf(locked())[0]?.urlRequired).toBe(false);
    expect(curriculumErrors("Bina", [], resourceDraftsOf(locked()))).toEqual(
      []
    );
    expect(curriculumPayload(locked(), lockedForm(), ZONE).resources).toEqual([
      { id: "r-1", name: "Kitap", meta: "PDF · 124 sayfa", type: "pdf" },
    ]);
  });

  it("does not let a row stored without an address stop Kaydet, and sends it without one", () => {
    const drafts = resourceDraftsOf(course());
    expect(curriculumErrors("Bina", [], drafts)).toEqual([]);
    expect(
      curriculumPayload(course(), form({ resources: drafts }), ZONE).resources
    ).toEqual([{ id: "r-1", name: "Kitap", meta: null, type: "PDF" }]);
    // An address typed into it is checked; a new row still needs one.
    expect(
      curriculumErrors(
        "Bina",
        [],
        [
          { ...(drafts[0] as ResourceDraft), url: "kitap.pdf" },
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
      id: "lr-1",
      lessonId: "l-1",
      name: "Emsile şerhi",
      meta: "PDF · 12 sayfa",
      url: "https://drive.google.com/file/d/1a2b3c/view",
      orderIndex: 0,
    },
    {
      id: "lr-2",
      lessonId: "l-1",
      name: "Tatbikat",
      meta: null,
      url: "https://files.medaris.org/tatbikat.pdf",
      orderIndex: 1,
    },
  ];
  const linked = (over: Record<string, unknown> = {}) =>
    course({
      weeks: [
        {
          id: "w-1",
          weekNumber: 1,
          title: "Birinci",
          summary: "Özet",
          lessons: [
            lesson({ resources: stored, ...over }),
            lesson({ id: "l-2", resources: [] }),
          ],
        },
      ],
    });
  /** What the save sends for each session after `change` on the first one's rows. */
  const sent = (
    change: (rows: LessonResourceDraft[]) => LessonResourceDraft[] = (rows) =>
      rows,
    read = linked()
  ) => {
    const weeks = weekDraftsOf(read, ZONE);
    const first = weeks[0]?.lessons[0] as LessonDraft;
    first.resources = change(first.resources);
    return (
      curriculumPayload(read, form({ weeks, resources: [] }), ZONE).weeks?.[0]
        ?.lessons ?? []
    );
  };

  it("are read as drafts, in order, keeping their ids", () => {
    expect(weekDraftsOf(linked(), ZONE)[0]?.lessons[0]?.resources).toEqual([
      {
        id: "lr-1",
        name: "Emsile şerhi",
        meta: "PDF · 12 sayfa",
        url: "https://drive.google.com/file/d/1a2b3c/view",
        urlRequired: true,
      },
      {
        id: "lr-2",
        name: "Tatbikat",
        meta: "",
        url: "https://files.medaris.org/tatbikat.pdf",
        urlRequired: true,
      },
    ]);
    // a content-locked read carries no address, so none is required
    expect(
      lessonResourceDraftsOf({
        resources: [{ ...stored[0], url: undefined }],
      } as never)
    ).toEqual([
      {
        id: "lr-1",
        name: "Emsile şerhi",
        meta: "PDF · 12 sayfa",
        url: "",
        urlRequired: false,
      },
    ]);
  });

  it("start empty on a new session, and are not copied with the week", () => {
    expect(emptyLesson("2026-10-12").resources).toEqual([]);
    const copy = copyWeek(
      weekDraftsOf(linked(), ZONE)[0] as WeekDraft,
      nextWeekNumber([])
    );
    expect(copy.lessons.map((l) => l.resources)).toEqual([[], []]);
    expect(emptyLessonResource()).toEqual({
      name: "",
      meta: "",
      url: "",
      urlRequired: true,
    });
  });

  it("move a row up or down, and stay as they are out of range", () => {
    expect(moveRow(["a", "b", "c"], 2, 1)).toEqual(["a", "c", "b"]);
    expect(moveRow(["a", "b", "c"], 0, 1)).toEqual(["b", "a", "c"]);
    expect(moveRow(["a", "b"], 0, -1)).toEqual(["a", "b"]);
    expect(moveRow(["a", "b"], 1, 2)).toEqual(["a", "b"]);
  });

  it("need a name and an absolute http(s) address, named by their session", () => {
    const weeks = weekDraftsOf(linked(), ZONE);
    const second = weeks[0]?.lessons[1] as LessonDraft;
    second.resources = [
      { ...emptyLessonResource(), url: "https://a.test/" },
      { ...emptyLessonResource(), name: "Bina", url: "" },
      { ...emptyLessonResource(), name: "Bina", url: "javascript:alert(1)" },
      { ...emptyLessonResource(), name: "Bina", url: "drive.google.com/x" },
    ];
    const at = { weekIndex: 0, lessonIndex: 1 };
    expect(curriculumErrors("Bina ve İzhar", weeks)).toEqual([
      { kind: "lessonResourceName", ...at, resourceIndex: 0 },
      { kind: "lessonResourceUrl", ...at, resourceIndex: 1 },
      { kind: "lessonResourceUrl", ...at, resourceIndex: 2 },
      { kind: "lessonResourceUrl", ...at, resourceIndex: 3 },
    ]);
    // a cancelled session is information and is not checked
    second.cancelledAt = "2026-10-01T00:00:00.000Z";
    expect(curriculumErrors("Bina ve İzhar", weeks)).toEqual([]);
  });

  it("make the form dirty when a session's row moves", () => {
    const saved = form({ weeks: weekDraftsOf(linked(), ZONE) });
    const weeks = weekDraftsOf(linked(), ZONE);
    expect(curriculumDirty(form({ weeks }), saved)).toBe(false);
    const first = weeks[0]?.lessons[0] as LessonDraft;
    first.resources = moveRow(first.resources, 0, 1);
    expect(curriculumDirty(form({ weeks }), saved)).toBe(true);
  });

  it("are not sent for a session whose list the form left as read, so tedrisat keeps it", () => {
    const lessons = sent();
    expect(lessons.map((l) => l.id)).toEqual(["l-1", "l-2"]);
    for (const l of lessons) expect(Object.keys(l)).not.toContain("resources");
  });

  it("are sent whole when changed: in order, kept rows with their ids, trimmed, an empty line as null", () => {
    const [first, second] = sent((rows) => [
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
        id: "lr-2",
        name: "Tatbikat defteri",
        meta: null,
        url: "https://files.medaris.org/tatbikat.pdf",
      },
      {
        id: "lr-1",
        name: "Emsile şerhi",
        meta: "PDF · 12 sayfa",
        url: "https://drive.google.com/file/d/1a2b3c/view",
      },
      { name: "Bina", meta: null, url: "https://files.medaris.org/bina.pdf" },
    ]);
    // the other session's list did not change
    expect(Object.keys(second ?? {})).not.toContain("resources");
  });

  it("are sent reordered, and as an empty list when every row is removed", () => {
    expect(
      sent((rows) => moveRow(rows, 1, 0))[0]?.resources?.map((r) => r.id)
    ).toEqual(["lr-2", "lr-1"]);
    expect(sent(() => [])[0]?.resources).toEqual([]);
  });

  it("are sent for a new session that has some, and not for one that has none", () => {
    const read = linked();
    const weeks = weekDraftsOf(read, ZONE);
    (weeks[0] as WeekDraft).lessons.push(
      draft({
        resources: [
          {
            ...emptyLessonResource(),
            name: "Emsile",
            url: "https://emsile.test/",
          },
        ],
      }),
      draft()
    );
    const [, , added, bare] =
      curriculumPayload(read, form({ weeks }), ZONE).weeks?.[0]?.lessons ?? [];
    expect(added).not.toHaveProperty("id");
    expect(added?.resources).toEqual([
      { name: "Emsile", meta: null, url: "https://emsile.test/" },
    ]);
    expect(Object.keys(bare ?? {})).not.toContain("resources");
  });

  it("are neither required nor sent back for a content-locked read", () => {
    const locked = course({
      contentLocked: true,
      weeks: [
        {
          id: "w-1",
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
    const weeks = weekDraftsOf(locked, ZONE);
    expect(curriculumErrors("Bina ve İzhar", weeks)).toEqual([]);
    const [first] =
      curriculumPayload(locked, form({ weeks }), ZONE).weeks?.[0]?.lessons ??
      [];
    expect(first).toMatchObject({ id: "l-1" });
    expect(Object.keys(first ?? {})).not.toContain("resources");
  });
});

describe("file rows (MDRS-287)", () => {
  const pdf = {
    name: "bina.pdf",
    contentType: "application/pdf",
    sizeBytes: 1_258_291,
    downloadUrl: "/courses/c-1/resources/r-9/file",
  };
  const courseFile = {
    id: "r-9",
    courseId: "c-1",
    name: "Bina metni",
    meta: "88 sayfa",
    file: pdf,
    orderIndex: 1,
  };
  const lessonFile = {
    id: "lr-9",
    lessonId: "l-1",
    name: "Emsile",
    meta: null,
    url: null,
    file: { ...pdf, downloadUrl: "/lessons/l-1/resources/lr-9/file" },
    orderIndex: 0,
  };
  const withFiles = () =>
    course({
      weeks: [
        {
          id: "w-1",
          weekNumber: 1,
          title: "Birinci",
          summary: "Özet",
          lessons: [lesson({ resources: [lessonFile] })],
        },
      ],
      resources: [
        { id: "r-1", name: "Kitap", meta: null, type: "PDF", url: null },
        courseFile,
      ],
    });

  it("are read with their file and no address, which nothing requires", () => {
    expect(resourceDraftsOf(withFiles())[1]).toEqual({
      id: "r-9",
      name: "Bina metni",
      meta: "88 sayfa",
      url: "",
      type: null,
      urlRequired: false,
      file: {
        name: "bina.pdf",
        contentType: "application/pdf",
        sizeBytes: 1_258_291,
      },
    });
    expect(weekDraftsOf(withFiles(), ZONE)[0]?.lessons[0]?.resources).toEqual([
      {
        id: "lr-9",
        name: "Emsile",
        meta: "",
        url: "",
        urlRequired: false,
        file: {
          name: "bina.pdf",
          contentType: "application/pdf",
          sizeBytes: 1_258_291,
        },
      },
    ]);
    const weeks = weekDraftsOf(withFiles(), ZONE);
    expect(
      curriculumErrors("Bina ve İzhar", weeks, resourceDraftsOf(withFiles()))
    ).toEqual([]);
  });

  it("go back in the course's list with their id and no address, so tedrisat keeps the file", () => {
    const read = withFiles();
    const [kitap, file] = resourceDraftsOf(read) as [
      ResourceDraft,
      ResourceDraft,
    ];
    const body = curriculumPayload(
      read,
      form({ resources: [{ ...file, name: " Bina ", meta: "" }, kitap] }),
      ZONE
    );
    expect(body.resources).toEqual([
      { id: "r-9", name: "Bina", meta: null, type: undefined },
      { id: "r-1", name: "Kitap", meta: null, type: "PDF" },
    ]);
    // left out, a file row is not sent: tedrisat deletes it, file and all
    expect(
      curriculumPayload(read, form({ resources: [kitap] }), ZONE).resources
    ).toEqual([{ id: "r-1", name: "Kitap", meta: null, type: "PDF" }]);
  });

  it("go back in a session's changed list with their id and no address", () => {
    const read = withFiles();
    const weeks = weekDraftsOf(read, ZONE);
    const first = weeks[0]?.lessons[0] as LessonDraft;
    first.resources = [
      { ...(first.resources[0] as LessonResourceDraft), name: "Emsile şerhi" },
      {
        ...emptyLessonResource(),
        name: "Tatbikat",
        url: "https://files.medaris.org/t.pdf",
      },
    ];
    const sent = curriculumPayload(read, form({ weeks }), ZONE).weeks?.[0]
      ?.lessons?.[0];
    expect(sent?.resources).toEqual([
      { id: "lr-9", name: "Emsile şerhi", meta: null },
      { name: "Tatbikat", meta: null, url: "https://files.medaris.org/t.pdf" },
    ]);
  });

  it("take the version an upload answered with only when nobody else saved in between", () => {
    expect(versionAfterUpload(7, 8)).toBe(8);
    // 9: somebody saved the course since the page read 7; the next save must meet the 409
    expect(versionAfterUpload(7, 9)).toBe(7);
    expect(versionAfterUpload(7, 7)).toBe(7);
  });

  it("join the course as stored after an upload, so the save carries the new version and a session's list is unchanged", () => {
    const read = course();
    const after = courseAfterUpload(read, {
      resource: courseFile as never,
      courseVersion: 8,
    });
    expect(after.version).toBe(8);
    expect(after.resources.map((r) => r.id)).toEqual(["r-1", "r-9"]);
    const uploaded = courseAfterLessonUpload(after, "l-1", {
      resource: lessonFile as never,
      courseVersion: 9,
    });
    expect(uploaded.version).toBe(9);
    const row = lessonResourceDraftOf(lessonFile as never);
    const weeks = withLessonResource(weekDraftsOf(read, ZONE), "l-1", row);
    expect(weeks[0]?.lessons[0]?.resources).toEqual([row]);
    const body = curriculumPayload(
      uploaded,
      form({
        weeks,
        resources: [
          ...resourceDraftsOf(read),
          resourceDraftOf(courseFile as never),
        ],
      }),
      ZONE
    );
    expect(body.version).toBe(9);
    // the session's list is the one stored: it is not sent
    expect(Object.keys(body.weeks?.[0]?.lessons?.[0] ?? {})).not.toContain(
      "resources"
    );
    expect(body.resources?.map((r) => r.id)).toEqual(["r-1", "r-9"]);
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
