import type { useFormatter } from "next-intl";

type Formatter = ReturnType<typeof useFormatter>;

/** A Monday: 2026-10-05. Weekday names are read off real dates, in the page's locale. */
const MONDAY = Date.UTC(2026, 9, 5, 12);

/** The name of an ISO weekday (1 = Monday) in the page's locale. */
export function weekdayName(
  format: Formatter,
  isoWeekday: number,
  style: "short" | "long"
): string {
  return format.dateTime(new Date(MONDAY + (isoWeekday - 1) * 86_400_000), {
    weekday: style,
    timeZone: "UTC",
  });
}

/** "12 Ekim" or "12 Ekim 2026" for a "YYYY-MM-DD" calendar day. */
export function formatDay(
  format: Formatter,
  day: string,
  withYear: boolean
): string {
  return format.dateTime(new Date(`${day}T12:00:00Z`), {
    day: "numeric",
    month: "long",
    ...(withYear ? { year: "numeric" as const } : {}),
    timeZone: "UTC",
  });
}

/** An instant on the course's clock: "9 Ekim 2026 Cuma 21:00" or "3 Eki Cmt 21:00". */
export function formatInstant(
  format: Formatter,
  at: Date,
  timeZone: string,
  style: "full" | "short"
): string {
  return style === "full"
    ? format.dateTime(at, {
        day: "numeric",
        month: "long",
        year: "numeric",
        weekday: "long",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
        timeZone,
      })
    : format.dateTime(at, {
        day: "numeric",
        month: "short",
        weekday: "short",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
        timeZone,
      });
}
