import type {
  ICourseDetail,
  ILesson,
} from "../../../src/course/course.repository.interface";
import { withContent } from "../../../src/course/domain/course-content";
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
