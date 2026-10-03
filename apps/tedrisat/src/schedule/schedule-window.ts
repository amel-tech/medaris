import { InvalidScheduleWindowError } from "./errors/invalid-schedule-window.error";

const DAY_MS = 24 * 60 * 60 * 1000;

/** The longest span `GET /sessions` answers: Programım asks for seven days at a time. */
export const MAX_WINDOW_DAYS = 31;

/** `YYYY-MM-DD` or a full ISO 8601 date-time; anything `Date` would guess at is refused. */
const ISO_INSTANT =
  /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2}))?$/;

const parseInstant = (name: string, value: string | undefined): Date => {
  if (!value || !ISO_INSTANT.test(value)) {
    throw new InvalidScheduleWindowError(
      `\`${name}\` must be an ISO 8601 date or date-time with an offset`
    );
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new InvalidScheduleWindowError(`\`${name}\` is not a real date`);
  }
  return date;
};

/**
 * The half-open window `[from, to)` of a schedule read. A bare date means UTC
 * midnight, so a client that wants "today in Istanbul" sends the offset.
 */
export const parseScheduleWindow = (
  from: string | undefined,
  to: string | undefined
): { from: Date; to: Date } => {
  const start = parseInstant("from", from);
  const end = parseInstant("to", to);
  if (end <= start) {
    throw new InvalidScheduleWindowError("`to` must be after `from`");
  }
  if (end.getTime() - start.getTime() > MAX_WINDOW_DAYS * DAY_MS) {
    throw new InvalidScheduleWindowError(
      `The window may not be longer than ${MAX_WINDOW_DAYS} days`
    );
  }
  return { from: start, to: end };
};
