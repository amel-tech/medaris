/**
 * One session as an iCalendar file (RFC 5545) — MDRS-117 "Takvime ekle".
 *
 * Two rules shape the event, both from the issue:
 *
 * 1. It points at the Medaris session page, never at the meeting link. The
 *    meeting link changes every week and stays behind enrollment; a calendar
 *    entry can be forwarded and is stored on Google's and Apple's servers.
 *    Nothing here reads `lessons.meeting_url`: the input type below has no
 *    such field, and the controller passes the lesson field by field.
 * 2. `UID` is derived from the lesson id, which MDRS-95 keeps stable across
 *    edits, so a moved session re-imports over the old event instead of
 *    beside it. `SEQUENCE` is the course version (MDRS-95), which every
 *    syllabus write bumps, so the re-imported copy is also the newer one.
 *
 * Pure: no clock, no configuration. The caller passes `now` and the page URL.
 */

export const CALENDAR_LOCALES = { tr: "tr", en: "en", ar: "ar" } as const;
export type CalendarLocale =
  (typeof CALENDAR_LOCALES)[keyof typeof CALENDAR_LOCALES];

/** The one line that tells the reader where the meeting link is. */
const LINK_IS_ON_THE_PAGE: Record<CalendarLocale, string> = {
  tr: "Toplantı bağlantısı oturum sayfasındadır:",
  en: "The meeting link is on the session page:",
  ar: "رابط الاجتماع موجود في صفحة الجلسة:",
};

export interface CalendarLessonInput {
  course: { id: string; title: string; version: number };
  lesson: {
    id: string;
    title: string;
    scheduledAt: Date;
    durationMinutes: number | null;
  };
  /** Absolute URL of the session page in tedris-web. */
  sessionPageUrl: string;
  locale: CalendarLocale;
  now: Date;
}

/** The session page a calendar entry links to, without a locale prefix. */
export const sessionPageUrl = (
  webUrl: string,
  courseId: string,
  lessonId: string
): string =>
  `${webUrl}/courses/${encodeURIComponent(courseId)}/lessons/${encodeURIComponent(lessonId)}`;

export const lessonCalendarUid = (lessonId: string): string =>
  `lesson-${lessonId}@medaris.app`;

/** `SUMMARY`: "Course title — Session title". */
export const lessonCalendarSummary = (
  courseTitle: string,
  lessonTitle: string
): string => `${courseTitle} — ${lessonTitle}`;

/** `DESCRIPTION`: where the link is, then the page. */
export const lessonCalendarDescription = (
  pageUrl: string,
  locale: CalendarLocale
): string => `${LINK_IS_ON_THE_PAGE[locale]}\n${pageUrl}`;

/**
 * The end instant, or null when the session has no length. RFC 5545 §3.6.1:
 * a VEVENT whose DTSTART is a DATE-TIME and that has neither DTEND nor
 * DURATION ends when it starts, so an unknown length is written as that
 * rather than as a length nobody chose.
 */
export const lessonEnd = (
  start: Date,
  durationMinutes: number | null
): Date | null =>
  durationMinutes == null || durationMinutes <= 0
    ? null
    : new Date(start.getTime() + durationMinutes * 60_000);

/** `YYYYMMDDTHHMMSSZ` — a UTC DATE-TIME, the form RFC 5545 calls FORM #2. */
export const formatIcsUtc = (date: Date): string =>
  date
    .toISOString()
    .replace(/\.\d{3}Z$/, "Z")
    .replace(/[-:]/g, "");

/** RFC 5545 §3.3.11 TEXT escaping. */
export const escapeIcsText = (value: string): string =>
  value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n");

const encoder = new TextEncoder();

/**
 * RFC 5545 §3.1 folding: no line longer than 75 octets, continuation lines
 * start with one space. Octets, not characters — Turkish and Arabic titles
 * are multi-byte — and a fold never splits a character.
 */
export const foldIcsLine = (line: string): string => {
  const out: string[] = [];
  let current = "";
  let currentBytes = 0;
  for (const ch of line) {
    const size = encoder.encode(ch).length;
    const limit = out.length === 0 ? 75 : 74; // the leading space is one octet
    if (currentBytes + size > limit) {
      out.push(current);
      current = "";
      currentBytes = 0;
    }
    current += ch;
    currentBytes += size;
  }
  out.push(current);
  return out.join("\r\n ");
};

export const buildLessonIcs = (input: CalendarLessonInput): string => {
  const { course, lesson, sessionPageUrl: pageUrl, locale, now } = input;
  const end = lessonEnd(lesson.scheduledAt, lesson.durationMinutes);

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Medaris//tedrisat//TR",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${lessonCalendarUid(lesson.id)}`,
    `DTSTAMP:${formatIcsUtc(now)}`,
    `SEQUENCE:${course.version}`,
    `DTSTART:${formatIcsUtc(lesson.scheduledAt)}`,
    ...(end ? [`DTEND:${formatIcsUtc(end)}`] : []),
    `SUMMARY:${escapeIcsText(lessonCalendarSummary(course.title, lesson.title))}`,
    `DESCRIPTION:${escapeIcsText(lessonCalendarDescription(pageUrl, locale))}`,
    // URL is a URI value (§3.8.4.6) and is not TEXT-escaped; LOCATION is TEXT.
    `URL:${pageUrl}`,
    `LOCATION:${escapeIcsText(pageUrl)}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return `${lines.map(foldIcsLine).join("\r\n")}\r\n`;
};
