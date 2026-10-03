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
