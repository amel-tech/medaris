/**
 * Time-zone helpers shared by the web apps (MDRS-110).
 *
 * Session instants are stored as `timestamptz`, so the only open questions
 * are which zone a wall-clock time is meant in and which zone a viewer reads
 * it in. A course carries the first (`courses.time_zone`); the viewer's comes
 * from their profile or their browser and travels to the server render in
 * the `TIME_ZONE_COOKIE` cookie. Everything here is plain `Intl`, so it runs
 * the same in Node and in the browser.
 */

/** The zone a course is authored in unless it says otherwise. */
export const DEFAULT_TIME_ZONE = "Europe/Istanbul";

/** Carries the viewer's zone to the server render (next-intl `timeZone`). */
export const TIME_ZONE_COOKIE = "medaris-tz";

/** Whether `value` is an IANA zone name this runtime knows. */
export const isValidTimeZone = (value: unknown): value is string => {
  if (typeof value !== "string" || value.length === 0 || value.length > 64) {
    return false;
  }
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
};

/** `value` when it is a known zone, otherwise `fallback`. */
export const resolveTimeZone = (
  value: unknown,
  fallback: string = DEFAULT_TIME_ZONE
): string => (isValidTimeZone(value) ? value : fallback);

type WallClock = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

const wallClockFormats = new Map<string, Intl.DateTimeFormat>();

/** The calendar date and time `date` shows on a clock in `timeZone`. */
const wallClock = (date: Date, timeZone: string): WallClock => {
  let fmt = wallClockFormats.get(timeZone);
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
    wallClockFormats.set(timeZone, fmt);
  }
  const parts = fmt.formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value ?? 0);
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    // Some engines still print midnight as 24 under h23.
    hour: get("hour") % 24,
    minute: get("minute"),
    second: get("second"),
  };
};

/** How far `timeZone` is ahead of UTC at `date`, in minutes. */
export const timeZoneOffsetMinutes = (date: Date, timeZone: string): number => {
  const w = wallClock(date, timeZone);
  const asUtc = Date.UTC(
    w.year,
    w.month - 1,
    w.day,
    w.hour,
    w.minute,
    w.second
  );
  const wholeSeconds = Math.floor(date.getTime() / 1000) * 1000;
  return Math.round((asUtc - wholeSeconds) / 60_000);
};

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * `date` as the value of an `<input type="datetime-local">` showing the
 * clock in `timeZone` — `YYYY-MM-DDTHH:mm`.
 */
export const toZonedDatetimeLocal = (date: Date, timeZone: string): string => {
  const w = wallClock(date, timeZone);
  return `${w.year}-${pad(w.month)}-${pad(w.day)}T${pad(w.hour)}:${pad(w.minute)}`;
};

/**
 * The instant a `datetime-local` value means when read on a clock in
 * `timeZone`; null when the value is not `YYYY-MM-DDTHH:mm`.
 *
 * Around a DST change (measured on Europe/Berlin): a wall time the change
 * skips lands one hour later (02:30 → 03:30), and one it repeats resolves to
 * its second occurrence, in the winter offset.
 */
export const fromZonedDatetimeLocal = (
  value: string,
  timeZone: string
): Date | null => {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value);
  if (!m) return null;
  const asUtc = Date.UTC(
    Number(m[1]),
    Number(m[2]) - 1,
    Number(m[3]),
    Number(m[4]),
    Number(m[5])
  );
  // The offset depends on the instant we are looking for, so read it at a
  // first guess and again at the corrected instant; two passes settle it.
  const guess =
    asUtc - timeZoneOffsetMinutes(new Date(asUtc), timeZone) * 60_000;
  return new Date(
    asUtc - timeZoneOffsetMinutes(new Date(guess), timeZone) * 60_000
  );
};

/** Whether clocks in `a` and `b` show a different time at `date`. */
export const showsDifferentTime = (date: Date, a: string, b: string): boolean =>
  a !== b && timeZoneOffsetMinutes(date, a) !== timeZoneOffsetMinutes(date, b);

/** Whether `date` falls on the same calendar day in `a` and in `b`. */
export const isSameCalendarDay = (
  date: Date,
  a: string,
  b: string
): boolean => {
  const x = wallClock(date, a);
  const y = wallClock(date, b);
  return x.year === y.year && x.month === y.month && x.day === y.day;
};

/** "America/New_York" → "New York": the place part of a zone, for labels. */
export const timeZoneCity = (timeZone: string): string =>
  (timeZone.split("/").pop() ?? timeZone).replace(/_/g, " ");

/** Every zone this runtime knows, for a picker; always includes `current`. */
export const listTimeZones = (current?: string): string[] => {
  const supported = (
    Intl as unknown as { supportedValuesOf?: (key: string) => string[] }
  ).supportedValuesOf?.("timeZone") ?? [DEFAULT_TIME_ZONE];
  const zones = new Set(supported);
  zones.add(DEFAULT_TIME_ZONE);
  if (current && isValidTimeZone(current)) zones.add(current);
  return [...zones].sort();
};
