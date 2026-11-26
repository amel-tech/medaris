/**
 * How many calendar days are left before an exam (MDRS-248). A plain module,
 * so server components (Pano, the takvim) and the client "Sınav" badge share
 * one count.
 */

const DAY = 24 * 60 * 60_000;

/** Calendar days from `now` to `startsAt` in `timeZone`; null once it has begun. */
export const examDaysLeft = (
  startsAt: string | Date | null | undefined,
  now: number,
  timeZone: string
): number | null => {
  if (!startsAt) return null;
  const start = new Date(startsAt).getTime();
  if (Number.isNaN(start) || start <= now) return null;
  const day = (instant: number) => {
    const [y, m, d] = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
      .format(new Date(instant))
      .split("-")
      .map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((day(start) - day(now)) / DAY);
};

/**
 * "Sınav · 3 gün kaldı" as plain text, for the rows of Pano and the takvim;
 * just "Sınav" once it has begun. `t` reads the `tedris` namespace.
 */
export const examRunLabel = (
  t: (key: string, values?: Record<string, string | number>) => string,
  startsAt: string | Date,
  now: Date,
  timeZone: string
): string => {
  const left = examDaysLeft(startsAt, now.getTime(), timeZone);
  const exam = t("SchedulePage.exam");
  return left === null
    ? exam
    : `${exam} · ${t("CoursePage.examCountdown", { count: left })}`;
};
