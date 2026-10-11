import type {
  ICourseDetail,
  ILesson,
} from "../../../src/course/course.repository.interface";
import {
  withContent,
  withoutContent,
} from "../../../src/course/domain/course-content";
import { LessonType } from "../../../src/course/domain/lesson-type.enum";

const lesson = (id: string, cancelledAt: Date | null): ILesson => ({
  id,
  weekId: "w1",
  title: id,
  type: LessonType.LIVE,
  durationMinutes: 60,
  kaynak: null,
  scheduledAt: new Date("2026-10-09T18:00:00Z"),
  meetingUrl: "https://meet.google.com/abc-defg-hij",
  agenda: null,
  isPreview: false,
  orderIndex: 0,
  cancelledAt,
  cancelReason: cancelledAt ? "illness" : null,
  replacementLessonId: null,
  inPerson: true,
  inPersonOverride: true,
  hasLiveStream: true,
});

describe("withContent (nizam/56)", () => {
  const course = {
    weeks: [
      {
        id: "w1",
        courseId: "c1",
        weekNumber: 1,
        title: "Hafta 1",
        summary: null,
        orderIndex: 0,
        lessons: [lesson("kept", null), lesson("cancelled", new Date())],
      },
    ],
    resources: [],
  } as unknown as ICourseDetail;

  it("leaves a standing session's link and drops a cancelled one's", () => {
    const [kept, cancelled] = withContent(course).weeks[0].lessons;
    expect(kept.meetingUrl).toBe("https://meet.google.com/abc-defg-hij");
    expect(cancelled.meetingUrl).toBeNull();
    expect(cancelled.cancelReason).toBe("illness");
  });
});

/**
 * MDRS-283: how a session is attended goes where its meeting link goes. A
 * locked caller is told the course's own mark (public) and nothing about a
 * session's, a sample session included.
 */
describe("the attendance fields under the content rule (MDRS-283)", () => {
  const course = {
    inPerson: false,
    weeks: [
      {
        id: "w1",
        courseId: "c1",
        weekNumber: 1,
        title: "Hafta 1",
        summary: null,
        orderIndex: 0,
        lessons: [
          lesson("plain", null),
          { ...lesson("sample", null), isPreview: true },
        ],
      },
    ],
    resources: [],
  } as unknown as ICourseDetail;

  it("keeps them for a content reader", () => {
    const [plain] = withContent(course).weeks[0].lessons;
    expect(plain).toMatchObject({
      inPerson: true,
      inPersonOverride: true,
      hasLiveStream: true,
    });
  });

  it("removes the keys for everyone else, a sample session included", () => {
    const locked = withoutContent(course);
    expect(locked.inPerson).toBe(false);
    for (const l of locked.weeks[0].lessons) {
      for (const key of ["inPerson", "inPersonOverride", "hasLiveStream"]) {
        expect(l).not.toHaveProperty(key);
      }
    }
  });
});
