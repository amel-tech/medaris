import type {
  CourseDetailResponse,
  LessonResponse,
  WeekResponse,
} from "@medaris/services/tedrisat";

/**
 * The five states of the course page (designs tedris/05, 06, 08, 12 and 13),
 * plus the completed one that shares the enrolled card. The API decides what
 * the caller may read; this only names which page to draw.
 */
export type CourseViewState =
  | "visitor"
  | "apply"
  | "pending"
  | "enrolled"
  | "completed"
  | "revoked";

export const courseViewState = (
  course: Pick<CourseDetailResponse, "enrollment">,
  signedIn: boolean
): CourseViewState => {
  if (!signedIn) return "visitor";
  switch (course.enrollment?.status) {
    case "PENDING":
      return "pending";
    case "ENROLLED":
      return "enrolled";
    case "COMPLETED":
      return "completed";
    case "REVOKED":
      return "revoked";
    default:
      return "apply";
  }
};

/** Whether the caller holds a seat that reads the course's content. */
export const holdsSeat = (state: CourseViewState): boolean =>
  state === "enrolled" || state === "completed";

const at = (lesson: Pick<LessonResponse, "scheduledAt">): number | null => {
  if (lesson.scheduledAt == null) return null;
  const time = new Date(lesson.scheduledAt).getTime();
  return Number.isNaN(time) ? null : time;
};

const DEFAULT_MINUTES = 60;

const minutesOf = (lesson: Pick<LessonResponse, "durationMinutes">): number =>
  lesson.durationMinutes ?? DEFAULT_MINUTES;

export const isCancelled = (lesson: Pick<LessonResponse, "cancelledAt">) =>
  lesson.cancelledAt != null;

const lessonsOf = (course: Pick<CourseDetailResponse, "weeks">) =>
  course.weeks.flatMap((week) => week.lessons);

/** The programme in numbers: weeks, sessions, and whole hours (a cancelled session still counts as part of the programme). */
export const courseTotals = (
  course: Pick<CourseDetailResponse, "weeks">
): { weeks: number; sessions: number; hours: number } => {
  const lessons = lessonsOf(course);
  const minutes = lessons.reduce(
    (sum, lesson) => sum + (lesson.durationMinutes ?? 0),
    0
  );
  return {
    weeks: course.weeks.length,
    sessions: lessons.length,
    hours: Math.round(minutes / 60),
  };
};

/**
 * The next session still ahead that was not cancelled, with the number of its
 * week (design: "SIRADAKİ CELSE" is the nearest one that is not cancelled).
 */
export const nextSession = (
  course: Pick<CourseDetailResponse, "weeks">,
  now: number
): {
  lesson: LessonResponse & { scheduledAt: Date };
  weekNumber: number;
} | null => {
  let best: {
    lesson: LessonResponse & { scheduledAt: Date };
    weekNumber: number;
    time: number;
  } | null = null;
  for (const week of course.weeks) {
    for (const lesson of week.lessons) {
      const time = at(lesson);
      if (time === null || time <= now || isCancelled(lesson)) continue;
      if (best === null || time < best.time) {
        best = {
          lesson: lesson as LessonResponse & { scheduledAt: Date },
          weekNumber: week.weekNumber,
          time,
        };
      }
    }
  }
  return best && { lesson: best.lesson, weekNumber: best.weekNumber };
};

/** A session is over once its start plus its length has passed. */
export const hasEnded = (lesson: LessonResponse, now: number): boolean => {
  const start = at(lesson);
  return start !== null && start + minutesOf(lesson) * 60_000 <= now;
};

export type WeekState = "default" | "active" | "done";

/**
 * Where a week stands: done when every session it has is over, active when it
 * holds the next session (or one running now), otherwise default. A week
 * with no scheduled session has no state.
 */
export const weekState = (
  week: WeekResponse,
  nextWeekNumber: number | null,
  now: number
): WeekState => {
  const scheduled = week.lessons.filter((l) => at(l) !== null);
  if (scheduled.length === 0) return "default";
  if (scheduled.every((l) => isCancelled(l) || hasEnded(l, now))) return "done";
  if (
    week.weekNumber === nextWeekNumber ||
    scheduled.some(
      (l) => !isCancelled(l) && !hasEnded(l, now) && (at(l) ?? now + 1) <= now
    )
  ) {
    return "active";
  }
  return "default";
};

/** The week's first session start, or null. */
export const weekOpensAt = (week: WeekResponse): number | null => {
  const starts = week.lessons.map(at).filter((t): t is number => t !== null);
  return starts.length === 0 ? null : Math.min(...starts);
};

/** `YYYY-MM-DD` of an instant in a zone (the kit's `opensOn` is a date). */
export const isoDateIn = (time: number, timeZone: string): string => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(time));
  const get = (type: string) => parts.find((p) => p.type === type)?.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
};

/** Whole calendar days from `now` to `time` in a zone: 0 today, 1 tomorrow. */
export const calendarDaysUntil = (
  time: number,
  now: number,
  timeZone: string
): number => {
  const day = (t: number) => Date.parse(`${isoDateIn(t, timeZone)}T00:00:00Z`);
  return Math.round((day(time) - day(now)) / 86_400_000);
};

/** "3 gün sonra", "yarın", "öbür gün", "bugün": the language's own words. */
export const relativeDay = (
  time: number,
  now: number,
  locale: string,
  timeZone: string
): string =>
  new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(
    calendarDaysUntil(time, now, timeZone),
    "day"
  );

const parts = (
  time: number,
  locale: string,
  timeZone: string,
  options: Intl.DateTimeFormatOptions
) => new Intl.DateTimeFormat(locale, { ...options, timeZone }).format(time);

/** The course's span, "13 Eylül – 29 Kasım 2026", from its first to its last session. */
export const courseSpan = (
  course: Pick<CourseDetailResponse, "weeks" | "timeZone">,
  locale: string
): string | null => {
  const times = lessonsOf(course)
    .map(at)
    .filter((t): t is number => t !== null);
  if (times.length === 0) return null;
  const first = Math.min(...times);
  const last = Math.max(...times);
  const zone = course.timeZone;
  return `${parts(first, locale, zone, { day: "numeric", month: "long" })} – ${parts(
    last,
    locale,
    zone,
    { day: "numeric", month: "long", year: "numeric" }
  )}`;
};

/**
 * "Her pazar 21:00 · 60 dk" as data: the weekday name, the clock and the
 * length, when every scheduled session of the course falls on one weekday at
 * one time and has one length; null when the programme has no such rhythm.
 */
export const courseRhythm = (
  course: Pick<CourseDetailResponse, "weeks" | "timeZone">,
  locale: string
): { weekday: string; clock: string; minutes: number } | null => {
  const scheduled = lessonsOf(course).filter((l) => at(l) !== null);
  if (scheduled.length === 0) return null;
  const zone = course.timeZone;
  const keyOf = (l: LessonResponse) =>
    `${parts(at(l) as number, "en-US", zone, { weekday: "long" })}|${parts(
      at(l) as number,
      "en-GB",
      zone,
      { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }
    )}|${minutesOf(l)}`;
  const keys = new Set(scheduled.map(keyOf));
  if (keys.size !== 1) return null;
  const sample = scheduled[0] as LessonResponse;
  return {
    weekday: parts(at(sample) as number, locale, zone, {
      weekday: "long",
    }).toLocaleLowerCase(locale),
    clock: parts(at(sample) as number, locale, zone, {
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }),
    minutes: minutesOf(sample),
  };
};

/** "bugün 10:02", or "12 Ekim 10:02" on another day, in the course's zone. */
export const sentAt = (
  time: number,
  now: number,
  locale: string,
  timeZone: string,
  todayWord: string
): string => {
  const clock = parts(time, locale, timeZone, {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  if (calendarDaysUntil(time, now, timeZone) === 0) {
    return `${todayWord} ${clock}`;
  }
  return `${parts(time, locale, timeZone, { day: "numeric", month: "long" })} ${clock}`;
};

/** A session's day and clock, "4 Ekim Pazar 21:00", in the course's zone. */
export const sessionWhen = (
  time: number,
  locale: string,
  timeZone: string
): string =>
  parts(time, locale, timeZone, {
    day: "numeric",
    month: "long",
    weekday: "long",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });

/** The progress a talebe types: a whole number from 0 to 100, else null. */
export const parseProgress = (text: string): number | null => {
  const trimmed = text.trim();
  if (!/^\d{1,3}$/.test(trimmed)) return null;
  const value = Number(trimmed);
  return value >= 0 && value <= 100 ? value : null;
};
