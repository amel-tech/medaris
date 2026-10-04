import type {
  ICreateLesson,
  ICreateWeek,
  ILesson,
  IWeek,
} from "../../../src/course/course.repository.interface";
import { LessonType } from "../../../src/course/domain/lesson-type.enum";
import { sessionWorkChanged } from "../../../src/course/domain/session-work";

const COURSE = "c0000000-0000-4000-8000-000000000001";
const WEEK = "e0000000-0000-4000-8000-000000000001";
const LIVE_ID = "10000000-0000-4000-8000-000000000001";
const VIDEO_ID = "10000000-0000-4000-8000-000000000002";

const lesson = (over: Partial<ILesson>): ILesson => ({
  id: LIVE_ID,
  weekId: WEEK,
  title: "Canlı ders",
  type: LessonType.LIVE,
  durationMinutes: 60,
  kaynak: "Bina · s. 4-9",
  scheduledAt: new Date("2026-10-10T18:00:00.000Z"),
  meetingUrl: "https://meet.google.com/bqx-mfzn-rde",
  agenda: [
    { time: "21:00", title: "Açılış" },
    { time: "21:10", title: "Ders" },
  ],
  isPreview: false,
  orderIndex: 0,
  cancelledAt: null,
  cancelReason: null,
  replacementLessonId: null,
  ...over,
});

const stored: IWeek[] = [
  {
    id: WEEK,
    courseId: COURSE,
    weekNumber: 1,
    title: "Birinci Bab",
    summary: null,
    orderIndex: 0,
    lessons: [
      lesson({}),
      lesson({
        id: VIDEO_ID,
        title: "Video",
        type: LessonType.VIDEO,
        scheduledAt: null,
        meetingUrl: null,
        agenda: null,
        isPreview: true,
        orderIndex: 1,
      }),
    ],
  },
];

/** What an editor sends for the untouched course: every lesson as stored. */
const asSent = (): ICreateWeek[] =>
  stored.map((week) => ({
    id: week.id,
    weekNumber: week.weekNumber,
    title: week.title,
    lessons: week.lessons.map(
      (l): ICreateLesson => ({
        id: l.id,
        title: l.title,
        type: l.type,
        durationMinutes: l.durationMinutes ?? undefined,
        kaynak: l.kaynak ?? undefined,
        scheduledAt: l.scheduledAt ?? undefined,
        meetingUrl: l.meetingUrl ?? undefined,
        agenda: l.agenda?.map((step) => ({ ...step })) ?? undefined,
        isPreview: l.isPreview,
      })
    ),
  }));

const withLive = (change: Partial<ICreateLesson>): ICreateWeek[] => {
  const sent = asSent();
  sent[0].lessons[0] = { ...sent[0].lessons[0], ...change };
  return sent;
};

describe("sessionWorkChanged (MDRS-135: course.edit or session.manage in a whole-course save)", () => {
  it("is false for the course sent back as stored", () => {
    expect(sessionWorkChanged(stored, asSent())).toBe(false);
  });

  it("leaves curriculum to course.edit: titles, length, source, a type that is not live, order and the week", () => {
    const sent = asSent();
    sent[0].title = "Yeni başlık";
    sent[0].lessons = [
      {
        ...sent[0].lessons[1],
        title: "Yeni video adı",
        kaynak: "s. 10",
        durationMinutes: 45,
        type: LessonType.QUIZ,
      },
      { ...sent[0].lessons[0], title: "Yeni ad" },
    ];
    expect(sessionWorkChanged(stored, sent)).toBe(false);
    // Moved to another week, which the save creates.
    const moved: ICreateWeek[] = [
      { ...asSent()[0], lessons: [asSent()[0].lessons[1]] },
      { weekNumber: 2, title: "İkinci Bab", lessons: [asSent()[0].lessons[0]] },
    ];
    expect(sessionWorkChanged(stored, moved)).toBe(false);
  });

  it("is true for a new session: no id, an unknown id, or a stored id sent twice", () => {
    const fresh = asSent();
    fresh[0].lessons.push({ title: "Yeni celse", type: LessonType.LIVE });
    expect(sessionWorkChanged(stored, fresh)).toBe(true);

    const unknown = asSent();
    unknown[0].lessons.push({
      id: "10000000-0000-4000-8000-0000000000ff",
      title: "Yeni celse",
      type: LessonType.LIVE,
    });
    expect(sessionWorkChanged(stored, unknown)).toBe(true);

    const twice = asSent();
    twice[0].lessons.push({ ...twice[0].lessons[0] });
    expect(sessionWorkChanged(stored, twice)).toBe(true);
  });

  it("is true for a live session made a video or a quiz, and for a lesson made live", () => {
    // The programme lists `type = 'LIVE'` only: taking a session out of it is
    // cancelling it, which is session.manage's (review D2-7a).
    expect(
      sessionWorkChanged(stored, withLive({ type: LessonType.VIDEO }))
    ).toBe(true);
    expect(
      sessionWorkChanged(stored, withLive({ type: LessonType.QUIZ }))
    ).toBe(true);
    const madeLive = asSent();
    madeLive[0].lessons[1] = {
      ...madeLive[0].lessons[1],
      type: LessonType.LIVE,
    };
    expect(sessionWorkChanged(stored, madeLive)).toBe(true);
  });

  it("is true for a session the save leaves out, which the replace hides", () => {
    const dropped = asSent();
    dropped[0].lessons.pop();
    expect(sessionWorkChanged(stored, dropped)).toBe(true);
    expect(sessionWorkChanged(stored, [])).toBe(true);
  });

  it("is true for a new time, a cleared one, a new link, a new agenda or a preview flag", () => {
    for (const change of [
      { scheduledAt: new Date("2026-10-17T18:00:00.000Z") },
      { scheduledAt: null as unknown as Date },
      { meetingUrl: "https://zoom.us/j/123" },
      { meetingUrl: null as unknown as string },
      { agenda: [{ time: "21:00", title: "Açılış" }] },
      { agenda: null as unknown as [] },
      { isPreview: true },
    ]) {
      expect(sessionWorkChanged(stored, withLive(change))).toBe(true);
    }
    // A missing preview flag is written as false: on a lesson that had it, a change.
    const unflagged = asSent();
    delete unflagged[0].lessons[1].isPreview;
    expect(sessionWorkChanged(stored, unflagged)).toBe(true);
  });

  it("is false for a field the save leaves out, which the replace does not write", () => {
    expect(
      sessionWorkChanged(
        stored,
        withLive({
          scheduledAt: undefined,
          meetingUrl: undefined,
          agenda: undefined,
        })
      )
    ).toBe(false);
  });

  it("reads the same instant, an empty agenda and a blank link as unchanged", () => {
    expect(
      sessionWorkChanged(
        stored,
        withLive({
          scheduledAt: new Date(Date.parse("2026-10-10T21:00:00.000+03:00")),
        })
      )
    ).toBe(false);
    const video = asSent();
    video[0].lessons[1] = {
      ...video[0].lessons[1],
      agenda: [],
      meetingUrl: "   ",
    };
    expect(sessionWorkChanged(stored, video)).toBe(false);
  });
});
