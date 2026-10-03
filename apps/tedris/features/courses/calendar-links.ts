/**
 * "Takvime ekle" links for one session (MDRS-117).
 *
 * The same event tedrisat writes into `GET /lessons/:id/calendar.ics`
 * (apps/tedrisat/src/course/calendar/lesson-calendar.ts): title "Course —
 * Session", start and end in UTC, and the session page — never the meeting
 * link — in the description and the location. Keep the two in step.
 */

export type CalendarLesson = {
  id: string;
  title: string;
  scheduledAt: Date;
  durationMinutes: number | null;
};

/** The session page, without a locale prefix: tedris picks the reader's. */
export const sessionPagePath = (courseId: string, lessonId: string): string =>
  `/courses/${encodeURIComponent(courseId)}/lessons/${encodeURIComponent(lessonId)}`;

/** `YYYYMMDDTHHMMSSZ`, the form Google's `dates` and iCalendar both take. */
const utcStamp = (date: Date): string =>
  date
    .toISOString()
    .replace(/\.\d{3}Z$/, "Z")
    .replace(/[-:]/g, "");

/**
 * Google Calendar's pre-filled "new event" page. A session without a length
 * ends when it starts, as it does in the .ics file.
 */
export const googleCalendarUrl = ({
  courseTitle,
  lesson,
  pageUrl,
  linkIsOnPage,
}: {
  courseTitle: string;
  lesson: CalendarLesson;
  /** Absolute session page URL. */
  pageUrl: string;
  /** The localized line "The meeting link is on the session page:". */
  linkIsOnPage: string;
}): string => {
  const start = lesson.scheduledAt;
  const end =
    lesson.durationMinutes != null && lesson.durationMinutes > 0
      ? new Date(start.getTime() + lesson.durationMinutes * 60_000)
      : start;
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: `${courseTitle} — ${lesson.title}`,
    dates: `${utcStamp(start)}/${utcStamp(end)}`,
    details: `${linkIsOnPage}\n${pageUrl}`,
    location: pageUrl,
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
};

/** tedris's own handler, which fetches the .ics from tedrisat. */
export const icsDownloadPath = (lessonId: string, locale: string): string =>
  `/api/lessons/${encodeURIComponent(lessonId)}/calendar?locale=${encodeURIComponent(locale)}`;
