import type {
  ICourseDetailView,
  ILessonView,
  IWeekView,
} from "../../../src/course/course.repository.interface";
import { LessonType } from "../../../src/course/domain/lesson-type.enum";
import { SessionStatus } from "../../../src/course/domain/session-status.enum";
import {
  buildSessionView,
  DEFAULT_SESSION_MINUTES,
  sessionStatus,
} from "../../../src/course/domain/session-view";

const NOW = new Date("2026-10-03T17:52:00.000Z");
const minutesFromNow = (m: number) => new Date(NOW.getTime() + m * 60_000);

describe("sessionStatus (MDRS-158)", () => {
  const status = (
    scheduledAt: Date | null,
    durationMinutes: number | null,
    cancelledAt: Date | null = null
  ) => sessionStatus({ scheduledAt, durationMinutes, cancelledAt }, NOW);

  it("is CANCELLED whenever it was cancelled, whatever the clock says", () => {
    expect(status(minutesFromNow(-500), 45, NOW)).toBe(SessionStatus.CANCELLED);
    expect(status(minutesFromNow(30), 45, NOW)).toBe(SessionStatus.CANCELLED);
    expect(status(null, null, NOW)).toBe(SessionStatus.CANCELLED);
  });

  it("is SCHEDULED before the start and when it has no time", () => {
    expect(status(minutesFromNow(8), 60)).toBe(SessionStatus.SCHEDULED);
    expect(status(null, 60)).toBe(SessionStatus.SCHEDULED);
  });

  it("is LIVE from the start to the end, and ENDED from the end on", () => {
    expect(status(minutesFromNow(0), 60)).toBe(SessionStatus.LIVE);
    expect(status(minutesFromNow(-59), 60)).toBe(SessionStatus.LIVE);
    expect(status(minutesFromNow(-60), 60)).toBe(SessionStatus.ENDED);
    expect(status(minutesFromNow(-61), 60)).toBe(SessionStatus.ENDED);
  });

  it("gives a session with no length the default hour", () => {
    expect(DEFAULT_SESSION_MINUTES).toBe(60);
    expect(status(minutesFromNow(-59), null)).toBe(SessionStatus.LIVE);
    expect(status(minutesFromNow(-60), null)).toBe(SessionStatus.ENDED);
  });
});

const lesson = (id: string, over: Partial<ILessonView> = {}): ILessonView => ({
  id,
  weekId: "w",
  title: id,
  type: LessonType.LIVE,
  durationMinutes: 45,
  scheduledAt: minutesFromNow(60),
  isPreview: false,
  orderIndex: 0,
  cancelledAt: null,
  replacementLessonId: null,
  kaynak: null,
  meetingUrl: "https://zoom.us/j/1",
  agenda: null,
  cancelReason: null,
  ...over,
});

const week = (weekNumber: number, ...lessons: ILessonView[]): IWeekView => ({
  id: `week-${weekNumber}`,
  courseId: "c",
  weekNumber,
  title: `Hafta ${weekNumber}`,
  summary: null,
  orderIndex: weekNumber,
  lessons,
});

const course = (...weeks: IWeekView[]) =>
  ({
    id: "c",
    weeks,
    muderris: [
      { name: "Abdülhamit Karaosmanoğlu", title: null, userId: "u1" },
      { name: "Hâfız", title: "Müderris", userId: "u2" },
    ],
    contentLocked: false,
  }) as unknown as ICourseDetailView;

describe("buildSessionView (MDRS-158)", () => {
  const cancelled = lesson("cancelled", {
    cancelledAt: NOW,
    cancelReason: "hasta",
    replacementLessonId: "makeup",
  });
  const detail = course(
    week(4, lesson("old", { scheduledAt: minutesFromNow(-9000) })),
    week(
      5,
      lesson("now"),
      cancelled,
      lesson("makeup"),
      lesson("video", { type: LessonType.VIDEO, scheduledAt: null })
    ),
    week(6, lesson("later"))
  );

  it("is null for a missing session and for a lesson that is not live", () => {
    expect(buildSessionView(detail, "nope", NOW)).toBeNull();
    expect(buildSessionView(detail, "video", NOW)).toBeNull();
  });

  it("skips cancelled sessions when it picks the neighbours", () => {
    const view = buildSessionView(detail, "now", NOW);
    expect(view?.previous?.id).toBe("old");
    expect(view?.previous?.weekNumber).toBe(4);
    expect(view?.next?.id).toBe("makeup");
    expect(buildSessionView(detail, "later", NOW)?.next).toBeNull();
    expect(buildSessionView(detail, "old", NOW)?.previous).toBeNull();
  });

  it("describes a cancelled session by its replacement and withholds the link", () => {
    const view = buildSessionView(detail, "cancelled", NOW);
    expect(view).toMatchObject({
      status: SessionStatus.CANCELLED,
      cancelReason: "hasta",
      replacementSessionId: "makeup",
      meetingUrl: null,
      previous: { id: "now" },
      next: { id: "makeup" },
    });
    expect(view?.replacement).toMatchObject({ id: "makeup", weekNumber: 5 });
  });

  it("drops a replacement that is no longer in the programme", () => {
    const orphan = course(
      week(1, { ...cancelled, replacementLessonId: "gone" })
    );
    const view = buildSessionView(orphan, "cancelled", NOW);
    expect(view?.replacementSessionId).toBeNull();
    expect(view?.replacement).toBeNull();
  });

  it("badges the imam among the müderrisler, and nobody without an imam grant", () => {
    expect(buildSessionView(detail, "now", NOW, "u1")?.muderris).toEqual([
      { name: "Abdülhamit Karaosmanoğlu", title: null, isImam: true },
      { name: "Hâfız", title: "Müderris", isImam: false },
    ]);
    expect(
      buildSessionView(detail, "now", NOW)?.muderris.some((m) => m.isImam)
    ).toBe(false);
  });

  it("withholds the link once the session is over", () => {
    const over = course(
      week(1, lesson("over", { scheduledAt: minutesFromNow(-120) }))
    );
    const view = buildSessionView(over, "over", NOW);
    expect(view?.status).toBe(SessionStatus.ENDED);
    expect(view?.meetingUrl).toBeNull();
  });

  it("names no content key when the filtered lesson carries none", () => {
    const {
      meetingUrl: _m,
      agenda: _a,
      kaynak: _k,
      cancelReason: _r,
      ...open
    } = lesson("now");
    const locked = {
      ...course(week(5, open)),
      contentLocked: true,
    } as ICourseDetailView;
    const view = buildSessionView(locked, "now", NOW) as object;
    for (const key of ["meetingUrl", "agenda", "kaynak", "cancelReason"]) {
      expect(view).not.toHaveProperty(key);
    }
    expect(view).toHaveProperty("contentLocked", true);
  });
});
