import type { CourseDetailResponse } from "@medaris/services/tedrisat";

/**
 * A draft is on the page only for those who may edit it (the API answers 404
 * to everyone else), so a DRAFT course on this page is a preview (design
 * tedris/14): no application, a banner, a card that says what students will see.
 */
export const isPreview = (course: Pick<CourseDetailResponse, "status">) =>
  course.status === "DRAFT";

/** The earliest `scheduledAt` among the course's lessons, or null when none is scheduled. */
export const firstSessionAt = (
  course: Pick<CourseDetailResponse, "weeks">
): Date | null => {
  let first: Date | null = null;
  for (const lesson of course.weeks.flatMap((week) => week.lessons)) {
    if (lesson.scheduledAt == null) continue;
    const at = new Date(lesson.scheduledAt);
    if (Number.isNaN(at.getTime())) continue;
    if (first === null || at.getTime() < first.getTime()) first = at;
  }
  return first;
};

/** "12 Ekim Pazartesi 21:00": the day, the month, the weekday and the clock, in the course's zone. */
export const formatFirstSession = (
  at: Date,
  locale: string,
  timeZone: string
): string =>
  new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "long",
    weekday: "long",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone,
  }).format(at);
