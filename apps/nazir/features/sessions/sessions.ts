import type {
  CourseDetailResponse,
  CreateSessionBatchDto,
  WeeklyPatternDto,
} from "@medaris/services/tedrisat";
import {
  fromZonedDatetimeLocal,
  meetingUrlProblem,
  normalizeMeetingUrl,
  parseYoutubeLiveUrl,
  toZonedDatetimeLocal,
  type YoutubeLiveProblem,
} from "@medaris/utils";

/**
 * Celseler and "Celse planla" as rules: a course's sessions against
 * the clock, the checks a link or a pattern passes before it is sent, what
 * each write sends, and which sentence a refusal gets. Pure on purpose, so the
 * page and the forms have nothing to decide. nizam's course screens run the
 * same rules (`apps/nizam/features/courses/present.ts`); only the parts the
 * two screens share are kept here.
 */

// ---- addresses ---------------------------------------------------------------------

export const sessionsHref = (courseId: string): string =>
  `/ders/${encodeURIComponent(courseId)}/celseler`;

export const planHref = (courseId: string): string =>
  `${sessionsHref(courseId)}/planla`;

// ---- dates ---------------------------------------------------------------------------

/** ISO weekdays, Monday first (the order the chips are drawn in). */
export const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const;

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

const dayNumber = (date: string): number => {
  const [y = 1970, m = 1, d = 1] = date.split("-").map(Number);
  return Date.UTC(y, m - 1, d) / 86_400_000;
};

/** "YYYY-MM-DD" shifted by `days` calendar days; the zone plays no part. */
export function addDays(date: string, days: number): string {
  return new Date((dayNumber(date) + days) * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

/** ISO weekday of a "YYYY-MM-DD" date. */
export function isoWeekdayOf(date: string): number {
  return ((((dayNumber(date) + 3) % 7) + 7) % 7) + 1;
}

/** A Monday (2026-10-05): weekday names are read off real dates, in the page's language. */
const MONDAY = Date.UTC(2026, 9, 5, 12);

/** The name of an ISO weekday (1 = Monday). */
export const weekdayName = (
  locale: string,
  isoWeekday: number,
  style: "short" | "long"
): string =>
  new Intl.DateTimeFormat(locale, { weekday: style, timeZone: "UTC" }).format(
    new Date(MONDAY + (isoWeekday - 1) * 86_400_000)
  );

/** An instant on the viewer's clock: "9 Ekim 2026 Cuma 21:00" in full, "3 Eki Cmt 21:00" in short. */
export function whenLabel(
  at: Date,
  where: { locale: string; timeZone: string },
  style: "full" | "short"
): string {
  return new Intl.DateTimeFormat(where.locale, {
    day: "numeric",
    month: style === "full" ? "long" : "short",
    ...(style === "full" ? { year: "numeric" } : {}),
    weekday: style === "full" ? "long" : "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: where.timeZone,
  }).format(at);
}

// ---- sessions against the clock -----------------------------------------------------

export type SessionState = "live" | "scheduled" | "ended" | "cancelled";

/** A lesson without a length is taken as 60 minutes, as tedrisat does. */
export const DEFAULT_SESSION_MINUTES = 60;

/** What the page hands the table for one session: plain data, nothing that depends on the clock. */
export interface SessionFact {
  id: string;
  title: string;
  weekNumber: number;
  /** ISO time */
  startsAt: string;
  durationMinutes: number;
  meetingUrl: string | null;
  /** ISO time; null while the session stands */
  cancelledAt: string | null;
}

/** Every live session of the course as a flat fact, by date. A lesson of another kind, or without a time, is no session. */
export function sessionFacts(
  course: Pick<CourseDetailResponse, "weeks">
): SessionFact[] {
  const facts: SessionFact[] = [];
  for (const week of course.weeks) {
    for (const lesson of week.lessons) {
      if (lesson.type !== "LIVE" || !lesson.scheduledAt) continue;
      facts.push({
        id: lesson.id,
        title: lesson.title,
        weekNumber: week.weekNumber,
        startsAt: new Date(lesson.scheduledAt).toISOString(),
        durationMinutes: lesson.durationMinutes ?? DEFAULT_SESSION_MINUTES,
        meetingUrl: lesson.meetingUrl ?? null,
        cancelledAt: lesson.cancelledAt
          ? new Date(lesson.cancelledAt).toISOString()
          : null,
      });
    }
  }
  return facts.sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
}

/** The streams of the course as `{ lessonId: url }`; only the sessions that have a link are listed. */
export const streamsOf = (
  links: ReadonlyArray<{ lessonId: string; liveStreamUrl: string | null }>
): Record<string, string> =>
  Object.fromEntries(
    links.flatMap((link) =>
      link.liveStreamUrl ? [[link.lessonId, link.liveStreamUrl] as const] : []
    )
  );

export interface SessionRow extends SessionFact {
  start: Date;
  end: Date;
  state: SessionState;
  /** minutes the session has been running, while it is live */
  minutesLive: number | null;
}

export function sessionRows(
  facts: readonly SessionFact[],
  now: Date
): SessionRow[] {
  return facts.map((fact) => {
    const start = new Date(fact.startsAt);
    const end = new Date(start.getTime() + fact.durationMinutes * 60_000);
    const state: SessionState = fact.cancelledAt
      ? "cancelled"
      : now >= end
        ? "ended"
        : now >= start
          ? "live"
          : "scheduled";
    return {
      ...fact,
      start,
      end,
      state,
      minutesLive:
        state === "live"
          ? Math.floor((now.getTime() - start.getTime()) / 60_000)
          : null,
    };
  });
}

export interface SessionGroups {
  upcoming: SessionRow[];
  past: SessionRow[];
  cancelledUpcoming: number;
  /** "5–8", or "5" for one week; null with nothing upcoming */
  weekRange: string | null;
}

/**
 * "Yaklaşan" holds what has not ended yet (live, planned, and a cancelled one
 * whose time has not come), oldest first; "Geçmiş" the rest, newest first.
 */
export function groupSessions(
  rows: readonly SessionRow[],
  now: Date
): SessionGroups {
  const upcoming = rows
    .filter((row) => row.end > now)
    .sort((a, b) => a.start.getTime() - b.start.getTime());
  const past = rows
    .filter((row) => row.end <= now)
    .sort((a, b) => b.start.getTime() - a.start.getTime());
  const weeks = upcoming.map((row) => row.weekNumber);
  const lo = Math.min(...weeks);
  const hi = Math.max(...weeks);
  return {
    upcoming,
    past,
    cancelledUpcoming: upcoming.filter((row) => row.state === "cancelled")
      .length,
    weekRange:
      weeks.length === 0 ? null : lo === hi ? String(lo) : `${lo}–${hi}`,
  };
}

// ---- the meeting link ---------------------------------------------------------------

export type LinkProblem = "not-https" | "too-long" | "invalid";

/**
 * An empty link is allowed (it is added later); a filled one must be https. A
 * link typed with `http://` is refused as typed rather than silently
 * upgraded; a link with no scheme at all gets `https://`, as everywhere else.
 */
export function linkProblem(value: string): LinkProblem | null {
  const raw = value.trim();
  if (!raw) return null;
  if (/^http:/i.test(raw)) return "not-https";
  return meetingUrlProblem(normalizeMeetingUrl(raw)) ?? null;
}

/** The link a field holds, ready to send; null when it is empty or one tedrisat would refuse. */
export function sendableLink(value: string): string | null {
  const url = normalizeMeetingUrl(value);
  return url && linkProblem(value) === null ? url : null;
}

// ---- the live stream link -----------------------------------------------------------

/** The `stream.problems.*` key of a link the shared parser refuses. */
export type LiveStreamProblemKey =
  | "empty"
  | "channel"
  | "notYoutube"
  | "notHttps"
  | "noVideo";

const PROBLEM_KEYS: Record<YoutubeLiveProblem, LiveStreamProblemKey> = {
  empty: "empty",
  "too-long": "noVideo",
  invalid: "noVideo",
  "not-https": "notHttps",
  "not-youtube": "notYoutube",
  channel: "channel",
  "no-video": "noVideo",
};

/**
 * What the "Canlı yayın" field says before anything is sent: null when the
 * link is one tedrisat stores (`parseYoutubeLiveUrl` is the parser tedrisat
 * runs), otherwise the reason. Empty is a problem here: clearing the link is
 * its own button.
 */
export function liveStreamProblem(value: string): LiveStreamProblemKey | null {
  const parsed = parseYoutubeLiveUrl(value);
  return parsed.ok ? null : PROBLEM_KEYS[parsed.problem];
}

// ---- moving one session -------------------------------------------------------------

/** The date and the time a field pair holds, as the instant they name on the viewer's clock; null while either is missing. */
export function instantOf(
  date: string,
  time: string,
  timeZone: string
): Date | null {
  if (!DATE.test(date) || !TIME.test(time)) return null;
  return fromZonedDatetimeLocal(`${date}T${time}`, timeZone);
}

/** The two fields of an instant on the viewer's clock: `{ date: "2026-10-12", time: "21:00" }`. */
export function fieldsOf(
  at: Date,
  timeZone: string
): { date: string; time: string } {
  const [date = "", time = ""] = toZonedDatetimeLocal(at, timeZone).split("T");
  return { date, time: time.slice(0, 5) };
}

// ---- the plan -----------------------------------------------------------------------

export type RecurrenceEnd = "date" | "count";

export interface PlanForm {
  mode: "single" | "weekly";
  weekdays: number[];
  /** "HH:mm" */
  startTime: string;
  /** minutes, as typed */
  duration: string;
  timeZone: string;
  /** "YYYY-MM-DD" */
  startDate: string;
  endMode: RecurrenceEnd;
  endDate: string;
  count: string;
}

export type PlanProblem =
  | "weekdays"
  | "startTime"
  | "duration"
  | "startDate"
  | "endDate"
  | "endBeforeStart"
  | "count";

const validDuration = (value: string): boolean => {
  const minutes = Number(value);
  return Number.isInteger(minutes) && minutes >= 1 && minutes <= 1440;
};

/** The first thing wrong with each field; "N celse oluştur" is off while any is. */
export function planErrors(form: PlanForm): Partial<Record<PlanProblem, true>> {
  const errors: Partial<Record<PlanProblem, true>> = {};
  if (form.mode === "weekly" && form.weekdays.length === 0) {
    errors.weekdays = true;
  }
  if (!TIME.test(form.startTime)) errors.startTime = true;
  if (!validDuration(form.duration)) errors.duration = true;
  if (!DATE.test(form.startDate)) errors.startDate = true;
  if (form.mode === "weekly") {
    if (form.endMode === "date") {
      if (!DATE.test(form.endDate)) errors.endDate = true;
      else if (DATE.test(form.startDate) && form.endDate < form.startDate) {
        errors.endBeforeStart = true;
      }
    } else {
      const n = Number(form.count);
      if (!Number.isInteger(n) || n < 1 || n > 200) errors.count = true;
    }
  }
  return errors;
}

/**
 * "Tek seferlik" is a weekly pattern of one session on the weekday of its
 * date; "Haftalık tekrar" ends on a date (inclusive) or after N. tedrisat
 * expands it (the same call previews and saves), so this only builds it.
 */
export function planPattern(form: PlanForm): WeeklyPatternDto | null {
  if (Object.keys(planErrors(form)).length > 0) return null;
  const base = {
    startTime: form.startTime,
    timeZone: form.timeZone,
    startDate: form.startDate,
  };
  if (form.mode === "single") {
    return {
      ...base,
      weekdays: [isoWeekdayOf(form.startDate)],
      count: 1,
    };
  }
  const weekdays = [...form.weekdays].sort((a, b) => a - b);
  return form.endMode === "date"
    ? { ...base, weekdays, endDate: form.endDate }
    : { ...base, weekdays, count: Number(form.count) };
}

/** What the preview strip says about a planned list: how many, from when to when. */
export function planSummary(sessions: ReadonlyArray<{ localDate: string }>): {
  count: number;
  first: string | null;
  last: string | null;
} {
  const dates = sessions.map((session) => session.localDate).sort();
  return {
    count: dates.length,
    first: dates[0] ?? null,
    last: dates[dates.length - 1] ?? null,
  };
}

/** The body of "N celse oluştur": the pattern, a title, a length, and the first session's link when one was given. */
export function planRequest(
  pattern: WeeklyPatternDto,
  form: Pick<PlanForm, "duration">,
  title: string,
  firstLink: string | null
): CreateSessionBatchDto {
  return {
    ...pattern,
    title: title.trim(),
    durationMinutes: Number(form.duration),
    ...(firstLink ? { meetingUrl: firstLink } : {}),
  };
}

/** The make-up of a cancelled session: one session of the same length on a date and a time of the viewer's clock. */
export function makeUpRequest(
  cancelled: Pick<SessionRow, "title" | "durationMinutes">,
  at: { date: string; time: string; timeZone: string },
  suffix: string
): CreateSessionBatchDto | null {
  if (!instantOf(at.date, at.time, at.timeZone)) return null;
  return {
    weekdays: [isoWeekdayOf(at.date)],
    startTime: at.time,
    timeZone: at.timeZone,
    startDate: at.date,
    count: 1,
    title: `${cancelled.title} ${suffix}`.trim(),
    durationMinutes: cancelled.durationMinutes,
  };
}

/** A week later than a session, at the same time of day: where the make-up's fields start. */
export function makeUpFields(
  start: Date,
  timeZone: string
): { date: string; time: string } {
  const { date, time } = fieldsOf(start, timeZone);
  return { date: addDays(date, 7), time };
}

// ---- what the API refuses -----------------------------------------------------------

/** The message key (from the catalogue's root) of a refused write, from the code the API answered with. */
export function sessionErrorKey(code: string): string {
  switch (code) {
    case "AUTHZ_FORBIDDEN":
      return "Problems.actionForbidden";
    case "COURSE_VERSION_CONFLICT":
      return "Sessions.errors.versionConflict";
    case "LESSON_ALREADY_CANCELLED":
      return "Sessions.errors.alreadyCancelled";
    case "INVALID_SESSION_PATTERN":
      return "Sessions.errors.invalidPattern";
    case "LESSON_NOT_LIVE":
      return "Sessions.stream.errors.notLive";
    case "LESSON_CANCELLED":
      return "Sessions.stream.errors.cancelled";
    case "LIVE_STREAM_URL_INVALID":
      return "Sessions.stream.problems.noVideo";
    default:
      return "Problems.actionGeneric";
  }
}

/** Whether the answer means the course changed since the page was read, so the page is read again. */
export const courseMoved = (code: string): boolean =>
  code === "COURSE_VERSION_CONFLICT";
