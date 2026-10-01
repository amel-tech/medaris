/**
 * Expands a weekly pattern — "Tuesday and Thursday at 21:00" — into dated
 * sessions (MDRS-109, phase 1 of recurring lessons). The pattern itself is
 * not stored; what it produces are ordinary lessons.
 *
 * Every step works on calendar dates and wall-clock times in the pattern's
 * zone, and only the last one turns a local date and time into an instant.
 * That is what keeps 21:00 at 21:00 when the zone changes its UTC offset in
 * the middle of the range.
 */

/** Weekdays as ISO 8601 numbers: 1 = Monday … 7 = Sunday. */
export type IsoWeekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

/** No batch writes more sessions than this. */
export const MAX_BATCH_SESSIONS = 200;

/** Nor spans more days than this, start and end date included. */
export const MAX_BATCH_RANGE_DAYS = 366;

export interface IWeeklyPattern {
  weekdays: IsoWeekday[];
  /** Local start time, "HH:mm" (24-hour). */
  startTime: string;
  /** IANA zone the start time is meant in. */
  timeZone: string;
  /** First calendar day of the range, "YYYY-MM-DD". */
  startDate: string;
  /** Last calendar day of the range, inclusive. Exactly one of this or `count`. */
  endDate?: string;
  /** How many sessions to generate. Exactly one of this or `endDate`. */
  count?: number;
}

export interface IPlannedSession {
  /** When the session starts. */
  scheduledAt: Date;
  /** Its calendar date in the pattern's zone, "YYYY-MM-DD". */
  localDate: string;
  /**
   * The syllabus week it belongs in: the Monday-to-Sunday week that holds
   * `startDate` is 1, the next one 2, and so on.
   */
  weekNumber: number;
}

/** Why a pattern cannot be expanded; the caller turns it into a 400. */
export type WeeklyPatternProblem =
  | "INVALID_DATE"
  | "END_OR_COUNT_REQUIRED"
  | "END_BEFORE_START"
  | "RANGE_TOO_LONG"
  | "TOO_MANY_SESSIONS"
  | "NO_SESSIONS";

export class WeeklyPatternInvalid extends Error {
  constructor(readonly problem: WeeklyPatternProblem) {
    super(problem);
  }
}

const DAY_MS = 86_400_000;

/** "YYYY-MM-DD" as days since 1970-01-01; the zone plays no part. */
const toDayNumber = (date: string): number => {
  const [y, m, d] = date.split("-").map(Number);
  return Date.UTC(y, m - 1, d) / DAY_MS;
};

const fromDayNumber = (day: number): string =>
  new Date(day * DAY_MS).toISOString().slice(0, 10);

/** `toDayNumber`, refusing a day the calendar does not have (2026-02-30). */
const toCalendarDay = (date: string): number => {
  const day = /^\d{4}-\d{2}-\d{2}$/.test(date) ? toDayNumber(date) : Number.NaN;
  if (!Number.isInteger(day) || fromDayNumber(day) !== date) {
    throw new WeeklyPatternInvalid("INVALID_DATE");
  }
  return day;
};

/** ISO weekday of a day number; 1970-01-01 was a Thursday. */
const isoWeekday = (day: number): IsoWeekday =>
  (((((day + 3) % 7) + 7) % 7) + 1) as IsoWeekday;

/** The Monday on or before `day`. */
const mondayOf = (day: number): number => day - (isoWeekday(day) - 1);

const offsetFormats = new Map<string, Intl.DateTimeFormat>();

/** How far `timeZone` is ahead of UTC at `instant`, in minutes. */
const offsetMinutes = (instant: number, timeZone: string): number => {
  let fmt = offsetFormats.get(timeZone);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    offsetFormats.set(timeZone, fmt);
  }
  const parts = fmt.formatToParts(new Date(instant));
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value ?? 0);
  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour") % 24,
    get("minute"),
    get("second")
  );
  return Math.round((asUtc - Math.floor(instant / 1000) * 1000) / 60_000);
};

/**
 * The instant a wall-clock time on `day` means in `timeZone`. The offset
 * depends on the instant being looked for, so it is read at a first guess and
 * again at the corrected instant. Around a DST change this matches
 * `fromZonedDatetimeLocal` in `@medaris/utils`, which nizam uses for a single
 * session: a skipped time lands one hour later, a repeated one resolves to
 * its second occurrence.
 */
export const zonedTimeToInstant = (
  day: number,
  minutesOfDay: number,
  timeZone: string
): Date => {
  const asUtc = day * DAY_MS + minutesOfDay * 60_000;
  const guess = asUtc - offsetMinutes(asUtc, timeZone) * 60_000;
  return new Date(asUtc - offsetMinutes(guess, timeZone) * 60_000);
};

/**
 * The sessions `pattern` describes, in date order. Throws
 * `WeeklyPatternInvalid` for a pattern that has no end, runs backwards, or
 * would produce nothing or more than `MAX_BATCH_SESSIONS`.
 */
export const expandWeeklyPattern = (
  pattern: IWeeklyPattern
): IPlannedSession[] => {
  const hasEnd = pattern.endDate !== undefined;
  const hasCount = pattern.count !== undefined;
  if (hasEnd === hasCount) {
    throw new WeeklyPatternInvalid("END_OR_COUNT_REQUIRED");
  }
  if (hasCount && (pattern.count as number) > MAX_BATCH_SESSIONS) {
    throw new WeeklyPatternInvalid("TOO_MANY_SESSIONS");
  }

  const first = toCalendarDay(pattern.startDate);
  const last = hasEnd
    ? toCalendarDay(pattern.endDate as string)
    : first + MAX_BATCH_RANGE_DAYS - 1;
  if (last < first) throw new WeeklyPatternInvalid("END_BEFORE_START");
  if (last - first + 1 > MAX_BATCH_RANGE_DAYS) {
    throw new WeeklyPatternInvalid("RANGE_TOO_LONG");
  }

  const [hh, mm] = pattern.startTime.split(":").map(Number);
  const minutesOfDay = hh * 60 + mm;
  const weekdays = new Set(pattern.weekdays);
  const firstMonday = mondayOf(first);
  const wanted = hasCount
    ? (pattern.count as number)
    : Number.POSITIVE_INFINITY;

  const sessions: IPlannedSession[] = [];
  for (let day = first; day <= last && sessions.length < wanted; day++) {
    if (!weekdays.has(isoWeekday(day))) continue;
    if (sessions.length === MAX_BATCH_SESSIONS) {
      throw new WeeklyPatternInvalid("TOO_MANY_SESSIONS");
    }
    sessions.push({
      scheduledAt: zonedTimeToInstant(day, minutesOfDay, pattern.timeZone),
      localDate: fromDayNumber(day),
      weekNumber: (mondayOf(day) - firstMonday) / 7 + 1,
    });
  }
  if (sessions.length === 0) throw new WeeklyPatternInvalid("NO_SESSIONS");
  // `count` sessions do not fit in the longest range a batch may span.
  if (hasCount && sessions.length < wanted) {
    throw new WeeklyPatternInvalid("RANGE_TOO_LONG");
  }
  return sessions;
};
