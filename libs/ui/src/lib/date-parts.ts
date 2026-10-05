/**
 * Calendar arithmetic on the strings the native inputs exchange (MDRS-278):
 * "YYYY-MM-DD" for a date, "HH:mm" for a time, "YYYY-MM-DDTHH:mm" for both.
 *
 * A date field holds a day on the wall calendar, not an instant, so nothing
 * here parses a string with `Date`: `new Date("2026-10-05")` is UTC midnight
 * and prints as the 4th west of Greenwich. Days are counted on UTC timestamps
 * built from the parts (`setUTCFullYear`, which also keeps years below 100
 * literal), and the viewer's zone is read only by `todayIso`, the one place
 * where "the viewer's day" is the question.
 *
 * Every date this module returns is a valid "YYYY-MM-DD" between 0001-01-01
 * and 9999-12-31; every time a valid "HH:mm".
 */

export interface DateParts {
  year: number;
  /** 1–12 */
  month: number;
  day: number;
}

/** 1 = Monday … 7 = Sunday, as `Intl.Locale#weekInfo` counts. */
export type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export const MIN_ISO_DATE = "0001-01-01";
export const MAX_ISO_DATE = "9999-12-31";

const pad = (n: number, width = 2) => String(n).padStart(width, "0");

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

function validParts(p: DateParts): boolean {
  return (
    Number.isInteger(p.year) &&
    Number.isInteger(p.month) &&
    Number.isInteger(p.day) &&
    p.year >= 1 &&
    p.year <= 9999 &&
    p.month >= 1 &&
    p.month <= 12 &&
    p.day >= 1 &&
    p.day <= daysInMonth(p.year, p.month)
  );
}

/** "YYYY-MM-DD" to parts, or null for anything else (a 30 February too). */
export function parseIsoDate(
  value: string | null | undefined
): DateParts | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value ?? "");
  if (!m) return null;
  const [, y = "", mo = "", d = ""] = m;
  const parts = { year: +y, month: +mo, day: +d };
  return validParts(parts) ? parts : null;
}

export function isIsoDate(value: string | null | undefined): value is string {
  return parseIsoDate(value) !== null;
}

export function formatIsoDate({ year, month, day }: DateParts): string {
  return `${pad(year, 4)}-${pad(month)}-${pad(day)}`;
}

function toUtc({ year, month, day }: DateParts): number {
  const d = new Date(0);
  d.setUTCFullYear(year, month - 1, day);
  return d.getTime();
}

function fromUtc(ms: number): string {
  const d = new Date(ms);
  return formatIsoDate({
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
  });
}

function must(value: string): DateParts {
  const p = parseIsoDate(value);
  if (!p) throw new RangeError(`not a YYYY-MM-DD date: ${value}`);
  return p;
}

const DAY_MS = 86_400_000;

export function addDays(iso: string, days: number): string {
  const ms = toUtc(must(iso)) + days * DAY_MS;
  const d = new Date(ms);
  if (d.getUTCFullYear() < 1) return MIN_ISO_DATE;
  if (d.getUTCFullYear() > 9999) return MAX_ISO_DATE;
  return fromUtc(ms);
}

/** Moves by whole months and keeps the day, clamped to the month's last (31 Jan + 1 → 28/29 Feb). */
export function addMonths(iso: string, months: number): string {
  const p = must(iso);
  const index = p.year * 12 + (p.month - 1) + months;
  const year = Math.floor(index / 12);
  const month = index - year * 12 + 1;
  if (year < 1) return MIN_ISO_DATE;
  if (year > 9999) return MAX_ISO_DATE;
  return formatIsoDate({
    year,
    month,
    day: Math.min(p.day, daysInMonth(year, month)),
  });
}

export function addYears(iso: string, years: number): string {
  return addMonths(iso, years * 12);
}

/** The ISO weekday of a date: 1 = Monday … 7 = Sunday. */
export function weekdayOf(iso: string): Weekday {
  const js = new Date(toUtc(must(iso))).getUTCDay();
  return (js === 0 ? 7 : js) as Weekday;
}

/** The first day of the week that holds `iso`, the week starting on `firstDay`. */
export function startOfWeek(iso: string, firstDay: Weekday): string {
  return addDays(iso, -((weekdayOf(iso) - firstDay + 7) % 7));
}

export function endOfWeek(iso: string, firstDay: Weekday): string {
  return addDays(startOfWeek(iso, firstDay), 6);
}

/** The date if it lies within [min, max]; bounds that are not dates are ignored. */
export function isWithin(
  iso: string,
  min?: string | null,
  max?: string | null
): boolean {
  if (isIsoDate(min) && iso < min) return false;
  if (isIsoDate(max) && iso > max) return false;
  return true;
}

/** The nearest date within [min, max]. String order is date order for four-digit years. */
export function clampIsoDate(
  iso: string,
  min?: string | null,
  max?: string | null
): string {
  if (isIsoDate(min) && iso < min) return min;
  if (isIsoDate(max) && iso > max) return max;
  return iso;
}

/**
 * The weeks of a month, each seven cells long, starting on `firstDay`. A cell
 * outside the month is null: the grid shows one month, and the keyboard
 * crosses into the next one by moving past its last day.
 */
export function monthGrid(
  year: number,
  month: number,
  firstDay: Weekday
): Array<Array<string | null>> {
  const first = formatIsoDate({ year, month, day: 1 });
  const lead = (weekdayOf(first) - firstDay + 7) % 7;
  const total = daysInMonth(year, month);
  const cells: Array<string | null> = Array.from({ length: lead }, () => null);
  for (let day = 1; day <= total; day++) {
    cells.push(formatIsoDate({ year, month, day }));
  }
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: Array<Array<string | null>> = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

/** Whether any day of the month lies within [min, max]: the month buttons stop where nothing can be chosen. */
export function monthHasDayWithin(
  year: number,
  month: number,
  min?: string | null,
  max?: string | null
): boolean {
  const first = formatIsoDate({ year, month, day: 1 });
  const last = formatIsoDate({ year, month, day: daysInMonth(year, month) });
  if (isIsoDate(max) && first > max) return false;
  if (isIsoDate(min) && last < min) return false;
  return true;
}

/**
 * The locale's first day of the week, from `Intl.Locale#getWeekInfo` (or the
 * older `weekInfo` getter). A runtime without either, or a tag it rejects,
 * starts on Monday, which is the tr-TR week.
 */
export function firstDayOfWeek(locale: string): Weekday {
  try {
    const loc = new Intl.Locale(locale) as Intl.Locale & {
      getWeekInfo?: () => { firstDay?: number };
      weekInfo?: { firstDay?: number };
    };
    const day = loc.getWeekInfo?.().firstDay ?? loc.weekInfo?.firstDay;
    if (day && day >= 1 && day <= 7) return day as Weekday;
  } catch {
    // an unknown tag: the default below
  }
  return 1;
}

/** The viewer's calendar day, in the viewer's own zone. */
export function todayIso(now: Date = new Date()): string {
  return formatIsoDate({
    year: now.getFullYear(),
    month: now.getMonth() + 1,
    day: now.getDate(),
  });
}

/* --------------------------------------------------------------- Digits */

const ARABIC_INDIC = 0x0660;
const EXTENDED_ARABIC_INDIC = 0x06f0;

/** Arabic-Indic (٠–٩) and Extended Arabic-Indic (۰–۹) digits to ASCII; everything else unchanged. */
export function toAsciiDigits(text: string): string {
  return text.replace(/[\u0660-\u0669\u06f0-\u06f9]/g, (ch) => {
    const code = ch.charCodeAt(0);
    return String(
      code >= EXTENDED_ARABIC_INDIC
        ? code - EXTENDED_ARABIC_INDIC
        : code - ARABIC_INDIC
    );
  });
}

/**
 * ASCII digits written in the locale's own digits, the ones
 * `Intl.NumberFormat` (and the kit's `formatNumber`) prints for it.
 */
export function toLocaleDigits(text: string, locale: string): string {
  let glyphs: string[];
  try {
    const nf = new Intl.NumberFormat(locale, { useGrouping: false });
    glyphs = Array.from({ length: 10 }, (_, i) => nf.format(i));
  } catch {
    return text;
  }
  return text.replace(/[0-9]/g, (d) => glyphs[Number(d)] ?? d);
}

/* --------------------------------------------------------- Typed dates */

export type DatePartName = "day" | "month" | "year";

export interface DateInputPattern {
  /** the order the locale writes a numeric date in */
  order: DatePartName[];
  /** the locale's numeric date with the parts as letter runs ("GG.AA.YYYY") */
  placeholder: string;
}

const SAMPLE = toUtc({ year: 2026, month: 11, day: 22 });

function numericFormat(locale: string): Intl.DateTimeFormat {
  const options: Intl.DateTimeFormatOptions = {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
    calendar: "gregory",
  };
  try {
    return new Intl.DateTimeFormat(locale, options);
  } catch {
    return new Intl.DateTimeFormat("tr-TR", options);
  }
}

/**
 * How the locale writes a date in digits: tr "GG.AA.YYYY", en-US
 * "MM/DD/YYYY", en-GB "DD/MM/YYYY". The letters are Turkish for a Turkish
 * locale and English otherwise; a caller with another language passes its
 * own placeholder.
 */
export function dateInputPattern(locale: string): DateInputPattern {
  const tr = locale.toLowerCase().startsWith("tr");
  const letters: Record<DatePartName, string> = tr
    ? { day: "GG", month: "AA", year: "YYYY" }
    : { day: "DD", month: "MM", year: "YYYY" };
  const order: DatePartName[] = [];
  let placeholder = "";
  for (const part of numericFormat(locale).formatToParts(SAMPLE)) {
    if (part.type === "day" || part.type === "month" || part.type === "year") {
      order.push(part.type);
      placeholder += letters[part.type];
    } else if (part.type === "literal") {
      placeholder += part.value;
    }
  }
  if (order.length !== 3) {
    return { order: ["day", "month", "year"], placeholder: "GG.AA.YYYY" };
  }
  return { order, placeholder };
}

/**
 * A date as the field shows it: the locale's numeric form with two-digit day
 * and month ("05.10.2026" in tr), always in the Gregorian calendar the value
 * is in, in the locale's digits. "" for anything that is not a date.
 */
export function formatDateInput(iso: string, locale: string): string {
  const p = parseIsoDate(iso);
  return p ? numericFormat(locale).format(toUtc(p)) : "";
}

/**
 * Reads what was typed into a date field, for the locale's numeric order:
 * any run of non-digits separates the parts ("5.10.2026", "5/10/2026",
 * "05 10 2026"), eight digits in a row are read as the pattern without
 * separators ("05102026"), and an ISO "2026-10-05" is always accepted.
 * Arabic-Indic digits count as digits. The year must have four digits:
 * "5.10.26" is not guessed at. Returns "" for empty text and null for text
 * that is not a date.
 */
export function parseDateInput(text: string, locale: string): string | null {
  const ascii = toAsciiDigits(text)
    .replace(/[\u200e\u200f\u061c]/g, "")
    .trim();
  if (ascii === "") return "";
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(ascii);
  if (iso) {
    const [, y = "", mo = "", d = ""] = iso;
    return build(+y, +mo, +d, y);
  }
  if (/[^\d\s./\-,\u060c]/.test(ascii)) return null;
  const { order } = dateInputPattern(locale);
  let groups: string[] = ascii.match(/\d+/g) ?? [];
  const [run = ""] = groups;
  if (groups.length === 1 && run.length === 8) {
    groups = [];
    let at = 0;
    for (const name of order) {
      const width = name === "year" ? 4 : 2;
      groups.push(run.slice(at, at + width));
      at += width;
    }
  }
  if (groups.length !== 3) return null;
  const read: Partial<Record<DatePartName, string>> = {};
  order.forEach((name, i) => {
    read[name] = groups[i] ?? "";
  });
  const { day = "", month = "", year = "" } = read;
  if (day.length > 2 || month.length > 2) return null;
  return build(+year, +month, +day, year);
}

function build(
  year: number,
  month: number,
  day: number,
  yearText: string
): string | null {
  if (yearText.length !== 4 || year < 1000) return null;
  const parts = { year, month, day };
  return validParts(parts) ? formatIsoDate(parts) : null;
}

/* ---------------------------------------------------------------- Times */

export interface TimeParts {
  /** 0–23 */
  hour: number;
  minute: number;
}

/** "HH:mm" (or the native "HH:mm:ss", whose seconds are dropped) to parts. */
export function parseIsoTime(
  value: string | null | undefined
): TimeParts | null {
  const m = /^(\d{2}):(\d{2})(?::\d{2}(?:\.\d{1,3})?)?$/.exec(value ?? "");
  if (!m) return null;
  const hour = Number(m[1]);
  const minute = Number(m[2]);
  return hour <= 23 && minute <= 59 ? { hour, minute } : null;
}

export function formatIsoTime({ hour, minute }: TimeParts): string {
  return `${pad(hour)}:${pad(minute)}`;
}

/** A valid time as "HH:mm", seconds dropped; "" for anything else. */
export function normalizeIsoTime(value: string | null | undefined): string {
  const p = parseIsoTime(value);
  return p ? formatIsoTime(p) : "";
}

/**
 * Reads what was typed into a time field, always as a 24-hour clock: "21:00",
 * "21.00", "2100", "930" (09:30), "9" and "21" (whole hours). Arabic-Indic
 * digits count. Returns "" for empty text and null for anything else,
 * "9 PM" included: the field has no twelve-hour reading.
 */
export function parseTimeInput(text: string): string | null {
  const ascii = toAsciiDigits(text).trim();
  if (ascii === "") return "";
  let hour: string;
  let minute: string;
  const split = /^(\d{1,2})\s*[:.]\s*(\d{1,2})$/.exec(ascii);
  if (split) {
    // "9:3" is not read as 09:03 or 09:30: the minute needs both digits
    const [, h = "", m = ""] = split;
    if (m.length === 1) return null;
    hour = h;
    minute = m;
  } else if (/^\d{1,4}$/.test(ascii)) {
    if (ascii.length <= 2) {
      hour = ascii;
      minute = "00";
    } else {
      hour = ascii.slice(0, ascii.length - 2);
      minute = ascii.slice(-2);
    }
  } else if (/^\d{1,2}\s*:$/.test(ascii)) {
    hour = ascii.replace(/\D/g, "");
    minute = "00";
  } else {
    return null;
  }
  const h = +hour;
  const m = +minute;
  if (h > 23 || m > 59) return null;
  return formatIsoTime({ hour: h, minute: m });
}

/**
 * The mask a time field applies as it is typed: at most four digits, the
 * colon written after the hour, a first digit above 2 read as a one-digit
 * hour ("9" → "09:"). While deleting (`deleting`, from the input event's
 * `inputType`) neither is added back, so Backspace can remove the colon.
 * Digits come back ASCII; the field writes them in the locale's.
 */
export function maskTimeInput(raw: string, deleting = false): string {
  const ascii = toAsciiDigits(raw);
  let digits = ascii.replace(/\D/g, "");
  if (!deleting && /^\d[:.]/.test(ascii)) digits = `0${digits}`;
  digits = digits.slice(0, 4);
  if (!deleting && digits.length === 1 && digits > "2") digits = `0${digits}`;
  if (digits.length > 2) return `${digits.slice(0, 2)}:${digits.slice(2)}`;
  if (digits.length === 2 && !deleting) return `${digits}:`;
  return digits;
}

/** One step of the hour (wrapping 23 ↔ 00) or of the minute (59 ↔ 00) without touching the other part. */
export function stepTime(
  value: string,
  segment: "hour" | "minute",
  delta: number
): string {
  const p = parseIsoTime(value) ?? { hour: 0, minute: 0 };
  if (segment === "hour") {
    return formatIsoTime({ ...p, hour: (((p.hour + delta) % 24) + 24) % 24 });
  }
  return formatIsoTime({ ...p, minute: (((p.minute + delta) % 60) + 60) % 60 });
}

/** Every time of the day at `stepMinutes` from 00:00 ("00:00", "00:15", … "23:45"). */
export function timeOptions(stepMinutes: number): string[] {
  const step = Math.max(1, Math.min(720, Math.round(stepMinutes) || 15));
  const out: string[] = [];
  for (let t = 0; t < 24 * 60; t += step) {
    out.push(formatIsoTime({ hour: Math.floor(t / 60), minute: t % 60 }));
  }
  return out;
}

/** The time within ["HH:mm" min, max]; bounds that are not times are ignored. */
export function isTimeWithin(
  time: string,
  min?: string | null,
  max?: string | null
): boolean {
  const lo = normalizeIsoTime(min);
  const hi = normalizeIsoTime(max);
  if (lo && time < lo) return false;
  if (hi && time > hi) return false;
  return true;
}

/* ------------------------------------------------------------ Date-time */

/** "YYYY-MM-DDTHH:mm" (seconds allowed) to its two halves; a half that is not valid comes back "". */
export function splitDateTime(value: string | null | undefined): {
  date: string;
  time: string;
} {
  const [date = "", time = ""] = (value ?? "").split("T");
  return {
    date: isIsoDate(date) ? date : "",
    time: normalizeIsoTime(time),
  };
}

/** The native datetime-local value of a date and a time; "" unless both are there. */
export function joinDateTime(date: string, time: string): string {
  const t = normalizeIsoTime(time);
  return isIsoDate(date) && t ? `${date}T${t}` : "";
}
