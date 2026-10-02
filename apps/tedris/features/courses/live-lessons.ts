import type {
  CourseDetailResponse,
  LessonResponse,
} from "@medaris/services/tedrisat";

/** The soonest LIVE lesson that has not started yet, or null. "Takvime
 *  ekle" on the course page needs a real session time, so no fallback. */
export const upcomingLiveLesson = (
  course: CourseDetailResponse
): (LessonResponse & { scheduledAt: Date }) | null => {
  const now = Date.now();
  const upcoming = course.weeks
    .flatMap((w) => w.lessons)
    .filter(
      (l): l is LessonResponse & { scheduledAt: Date } =>
        l.type === "LIVE" &&
        l.scheduledAt != null &&
        new Date(l.scheduledAt).getTime() > now
    )
    .sort(
      (a, b) =>
        new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime()
    );
  return upcoming[0] ?? null;
};

/** Next upcoming LIVE lesson of a course, else its first lesson; used by the
 *  course page's continue button. */
export const nextLiveLesson = (
  course: CourseDetailResponse
): LessonResponse | null =>
  upcomingLiveLesson(course) ?? course.weeks[0]?.lessons[0] ?? null;
