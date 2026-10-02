import type { ScheduleSessionResponse } from "@medaris/services/tedrisat";
import { dayInZone } from "../courses/session-model";

/**
 * What Programım (design tedris/21) derives from the API's list: the window a
 * `?from=` asks for, the day groups, and the day label. Pure and clock-free
 * (`now` is always a parameter) so a spec can pin it.
 */

export const WINDOW_DAYS = 7;

const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** `YYYY-MM-DD` if it is a real calendar day, else null. */
export const parseDay = (value: string | undefined): string | null => {
  const match = value ? DAY_RE.exec(value) : null;
  if (!match) return null;
  const [, y, m, d] = match.map(Number);
  const probe = new Date(Date.UTC(y, m - 1, d));
  return probe.getUTCFullYear() === y &&
    probe.getUTCMonth() === m - 1 &&
    probe.getUTCDate() === d
    ? value
    : null;
};

/** `day` moved by `days` calendar days. A day is a label, so this is plain calendar arithmetic. */
export const addDays = (day: string, days: number): string => {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
};

/** Whole days from `from` to `to`, both `YYYY-MM-DD`. */
export const daysBetween = (from: string, to: string): number => {
  const ms = (day: string) => {
    const [y, m, d] = day.split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((ms(to) - ms(from)) / 86_400_000);
};

/** The zone's offset from UTC at `at`, in milliseconds (positive east of Greenwich). */
const offsetMs = (at: Date, timeZone: string): number => {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
      .formatToParts(at)
      .map((p) => [p.type, p.value])
  );
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second)
  );
  return asUtc - Math.floor(at.getTime() / 1000) * 1000;
};

/** The instant a calendar day starts in a zone (00:00 local). */
export const startOfDay = (day: string, timeZone: string): Date => {
  const [y, m, d] = day.split("-").map(Number);
  const naive = Date.UTC(y, m - 1, d);
  // Two passes: the offset at the guess may differ from the offset at the
  // answer when a daylight-saving change falls inside the day.
  const first = naive - offsetMs(new Date(naive), timeZone);
  return new Date(naive - offsetMs(new Date(first), timeZone));
};

export interface ScheduleWindow {
  /** The first day shown, `YYYY-MM-DD` in the viewer's zone. */
  fromDay: string;
  today: string;
  /** The API's `[from, to)`. */
  from: string;
  to: string;
  nextFromDay: string;
}

/**
 * The seven days `?from=` asks for. A missing, malformed or past day falls
 * back to today: Programım looks forward, never back.
 */
export const scheduleWindow = (
  fromParam: string | undefined,
  now: Date,
  timeZone: string
): ScheduleWindow => {
  const today = dayInZone(now, timeZone);
  const asked = parseDay(fromParam);
  const fromDay = asked && asked > today ? asked : today;
  const nextFromDay = addDays(fromDay, WINDOW_DAYS);
  return {
    fromDay,
    today,
    from: startOfDay(fromDay, timeZone).toISOString(),
    to: startOfDay(nextFromDay, timeZone).toISOString(),
    nextFromDay,
  };
};

export interface DayGroup {
  /** `YYYY-MM-DD` in the viewer's zone. */
  day: string;
  sessions: ScheduleSessionResponse[];
}

/** The sessions grouped by the day they start on in the viewer's zone, in the order given. */
export const groupByDay = (
  sessions: ScheduleSessionResponse[],
  timeZone: string
): DayGroup[] => {
  const groups: DayGroup[] = [];
  for (const session of sessions) {
    const day = dayInZone(new Date(session.startsAt), timeZone);
    const last = groups.at(-1);
    if (last && last.day === day) last.sessions.push(session);
    else groups.push({ day, sessions: [session] });
  }
  return groups;
};

export type DayLabel =
  | { kind: "today" | "tomorrow" | "dayAfter" }
  | { kind: "inDays"; count: number };

/** "Bugün", "Yarın", "Öbür gün", "5 gün sonra": how far a day is from today. */
export const dayLabel = (day: string, today: string): DayLabel => {
  const offset = daysBetween(today, day);
  if (offset <= 0) return { kind: "today" };
  if (offset === 1) return { kind: "tomorrow" };
  if (offset === 2) return { kind: "dayAfter" };
  return { kind: "inDays", count: offset };
};

/** "3 Ekim Cumartesi": the day heading, written for the locale. */
export const formatDayHeading = (
  day: string,
  locale: string,
  timeZone: string
): string => {
  const at = new Date(startOfDay(day, timeZone).getTime() + 12 * 3_600_000);
  const dm = new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "long",
    timeZone,
  }).format(at);
  const weekday = new Intl.DateTimeFormat(locale, {
    weekday: "long",
    timeZone,
  }).format(at);
  return `${dm} ${weekday}`;
};

/** "21:00": the clock of an instant in the viewer's zone. */
export const formatClock = (
  at: Date | string,
  locale: string,
  timeZone: string
): string =>
  new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone,
  }).format(typeof at === "string" ? new Date(at) : at);
