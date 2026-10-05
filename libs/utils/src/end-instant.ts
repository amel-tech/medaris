/**
 * The end of a role or a permission is an instant (MDRS-254).
 *
 * The API stores it as a `timestamptz` and compares instants: past when it is
 * not after now, too late when it is after the appointment it hangs on
 * (`checkGrantExpiry` in tedrisat). The screens ask for it in a
 * `datetime-local` field, a wall time with no zone, so the zone it is read in
 * is the one the screen shows moments in. Everything the screens decide about
 * an end goes through here, so they cannot disagree with the server by a
 * calendar day.
 */
import { timeZoneOffsetMinutes, toZonedDatetimeLocal } from "./time-zone";

const DAY_MS = 24 * 60 * 60 * 1000;

const LOCAL = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;

/**
 * The instant a `datetime-local` value means on a clock in `timeZone`, as an
 * ISO string; null when the value is not `YYYY-MM-DDTHH:mm` (seconds allowed)
 * or not a real date.
 *
 * Around a daylight-saving change the wall time is not a single instant:
 * - a wall time the change skips (Berlin, 02:30 on the last Sunday of March)
 *   moves forward by the gap, to 03:30;
 * - a wall time the change repeats (Berlin, 02:30 on the last Sunday of
 *   October) is its first occurrence, the one still in summer time.
 */
export function zonedLocalToIso(
  value: string,
  timeZone: string
): string | null {
  const m = LOCAL.exec(value);
  if (!m) return null;
  const [year, month, day, hour, minute, second] = [
    Number(m[1]),
    Number(m[2]),
    Number(m[3]),
    Number(m[4]),
    Number(m[5]),
    Number(m[6] ?? 0),
  ] as [number, number, number, number, number, number];
  const wall = Date.UTC(year, month - 1, day, hour, minute, second);
  const check = new Date(wall);
  if (
    Number.isNaN(check.getTime()) ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day ||
    check.getUTCHours() !== hour
  ) {
    return null;
  }

  // The zone's offset is one of the two it has a day before and a day after
  // the wall time (a zone changes offset at most once in such a span). An
  // offset is right when the zone, at the instant it gives, has that offset.
  const before = timeZoneOffsetMinutes(new Date(wall - DAY_MS), timeZone);
  const after = timeZoneOffsetMinutes(new Date(wall + DAY_MS), timeZone);
  const candidates = [...new Set([before, after])]
    .map((offset) => wall - offset * 60_000)
    .filter(
      (at) =>
        wall - timeZoneOffsetMinutes(new Date(at), timeZone) * 60_000 === at
    );
  // Two candidates is an overlap (the earlier is the first occurrence); none
  // is a gap, which the offset from before the change carries forward.
  const at =
    candidates.length > 0 ? Math.min(...candidates) : wall - before * 60_000;
  return new Date(at).toISOString();
}

/**
 * The value a `datetime-local` field holds for an instant read on a clock in
 * `timeZone`: `YYYY-MM-DDTHH:mm`, the seconds cut off. "" for a missing or
 * invalid instant.
 */
export function isoToZonedLocal(
  iso: string | Date | null | undefined,
  timeZone: string
): string {
  if (iso === null || iso === undefined) return "";
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? ""
    : toZonedDatetimeLocal(date, timeZone);
}

/** "unfinished": the picker is half typed, which the browser reports as "". */
export type EndProblem = "past" | "afterAssignment" | "unfinished";

/**
 * Whether an end field is half typed. A `datetime-local` input keeps the value
 * "" until every segment is filled and says so in `validity.badInput`, so "" on
 * its own cannot tell a person who cleared the end from one who typed a date and
 * not yet the time. The field is read as it is (an input, or what a form's
 * `elements.namedItem` returns); anything without a validity is not unfinished.
 */
export function isUnfinishedEnd(field: unknown): boolean {
  const input = field as {
    value?: unknown;
    validity?: { badInput?: unknown };
  } | null;
  return input?.value === "" && input.validity?.badInput === true;
}

/**
 * What is wrong with an end, by the server's own rule: "past" when it is not
 * after now (`<=`), "afterAssignment" when it is after the appointment's end
 * (`>`, so ending at the very instant the appointment ends is fine). Null when
 * it is fine; an appointment without an end limits nothing.
 */
export function endProblem(opts: {
  instant: Date;
  now: Date;
  assignmentEnd: Date | string | null;
}): EndProblem | null {
  const at = opts.instant.getTime();
  if (at <= opts.now.getTime()) return "past";
  if (
    opts.assignmentEnd !== null &&
    at > new Date(opts.assignmentEnd).getTime()
  ) {
    return "afterAssignment";
  }
  return null;
}

/**
 * What a form does with its end field: the instant to send and what is wrong
 * with it.
 *
 * "" is no end of its own (`iso` null, fine), unless the field is half typed
 * (`unfinished`, from `isUnfinishedEnd`): that is not an end the person chose to
 * leave out, and saving it would grant longer than the date they started to type
 * implies, so it is refused. A value equal to the prefill of
 * the stored end (`held`) is that end untouched, so the stored instant goes
 * back as it is: the field has minute precision and an end such as
 * 23:59:59 must not drift. Anything else is read in `timeZone`. A value that
 * is no moment cannot be an end after now, so it is "past".
 */
export function resolveEnd(opts: {
  value: string;
  held: string | Date | null;
  timeZone: string;
  now: Date;
  assignmentEnd: Date | string | null;
  unfinished?: boolean;
}): { iso: string | null; problem: EndProblem | null } {
  if (opts.value.trim() === "") {
    return { iso: null, problem: opts.unfinished ? "unfinished" : null };
  }
  const untouched =
    opts.held !== null &&
    opts.value === isoToZonedLocal(opts.held, opts.timeZone);
  const iso = untouched
    ? new Date(opts.held as string | Date).toISOString()
    : zonedLocalToIso(opts.value, opts.timeZone);
  if (iso === null) return { iso: null, problem: "past" };
  return {
    iso,
    problem: endProblem({
      instant: new Date(iso),
      now: opts.now,
      assignmentEnd: opts.assignmentEnd,
    }),
  };
}
