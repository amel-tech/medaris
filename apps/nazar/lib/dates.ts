/**
 * Days as the pages print them, in the viewer's zone (MDS-NUM-01): the long
 * form for a table cell ("29 Eylül 2026") and, in Turkish, the day and month
 * with the case ending a sentence needs ("30 Eylül’de").
 */
export const dayFormat = (locale: string, timeZone: string) =>
  new Intl.DateTimeFormat(locale, { dateStyle: "long", timeZone });

/** The locative ending (-de/-da/-te/-ta) by the last vowel and the last sound of each month's name. */
const LOCATIVE_TR = [
  "ta", // Ocak
  "ta", // Şubat
  "ta", // Mart
  "da", // Nisan
  "ta", // Mayıs
  "da", // Haziran
  "da", // Temmuz
  "ta", // Ağustos
  "de", // Eylül
  "de", // Ekim
  "da", // Kasım
  "ta", // Aralık
] as const;

/** "30 Eylül": a day and a month, without the year. */
export const dayMonth = (
  date: Date,
  locale: string,
  timeZone: string
): string =>
  new Intl.DateTimeFormat(locale, {
    timeZone,
    day: "numeric",
    month: "long",
  }).format(date);

/** "30 Eylül’de"; in any other language the bare "30 September", whose message carries the preposition. */
export function dayMonthLocative(
  date: Date,
  locale: string,
  timeZone: string
): string {
  const base = dayMonth(date, locale, timeZone);
  if (!locale.toLowerCase().startsWith("tr")) return base;
  const month =
    Number(
      new Intl.DateTimeFormat("en-US", { timeZone, month: "numeric" }).format(
        date
      )
    ) - 1;
  const ending = LOCATIVE_TR[month];
  return ending ? `${base}’${ending}` : base;
}

const ONES_TR = [
  "",
  "bir",
  "iki",
  "üç",
  "dört",
  "beş",
  "altı",
  "yedi",
  "sekiz",
  "dokuz",
];
const TENS_TR = ["", "on", "yirmi", "otuz", "kırk", "elli"];

/** How a number from 0 to 59 is last said, whose vowel and final sound a Turkish ending follows. */
const lastSaidTr = (n: number): string =>
  n === 0
    ? "sıfır"
    : n % 10 === 0
      ? (TENS_TR[n / 10] ?? "")
      : (ONES_TR[n % 10] ?? "");

/**
 * "20:00’de", "19:30’da", "14:15’te": a clock with the Turkish locative, which
 * follows the last word of how the time is said, the minutes, or the hour on
 * the hour ("yirmide"). Any other language gets the bare clock.
 */
export function clockLocative(clock: string, locale: string): string {
  if (!locale.toLowerCase().startsWith("tr")) return clock;
  const m = /^(\d{1,2})[:.](\d{2})$/.exec(clock);
  if (!m) return clock;
  const minute = Number(m[2]);
  const word = lastSaidTr(minute === 0 ? Number(m[1]) % 24 : minute);
  const back = /[aıou][^aıoueiöü]*$/.test(word);
  const hard = /[çfhkpsşt]$/.test(word);
  return `${clock}’${hard ? "t" : "d"}${back ? "a" : "e"}`;
}

/**
 * "14 Ekim 20:00’de": a day, a month and a clock in `timeZone`, as a sentence
 * says when (MDRS-288); in any other language "October 14, 20:00", whose
 * message carries the preposition.
 */
export function dayMonthClock(
  date: Date,
  locale: string,
  timeZone: string
): string {
  const clock = new Intl.DateTimeFormat(locale, {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
  const day = dayMonth(date, locale, timeZone);
  return locale.toLowerCase().startsWith("tr")
    ? `${day} ${clockLocative(clock, locale)}`
    : `${day}, ${clock}`;
}

/** The calendar day of an instant in a zone ("2026-10-02"): two instants fall on the same day when their keys are equal. */
export const dayKey = (date: Date, timeZone: string): string =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);

/**
 * "30 Eyl": a day in a table cell, on the viewer's calendar, with the year
 * ("30 Eyl 2025") once it is not the current one.
 */
export function shortDay(
  at: Date,
  now: Date,
  where: { locale: string; timeZone: string }
): string {
  const sameYear =
    dayKey(at, where.timeZone).slice(0, 4) ===
    dayKey(now, where.timeZone).slice(0, 4);
  return new Intl.DateTimeFormat(where.locale, {
    timeZone: where.timeZone,
    day: "numeric",
    month: "short",
    ...(sameYear ? {} : { year: "numeric" }),
  }).format(at);
}
