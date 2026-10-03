/**
 * "Paz 21:00": the weekday and the clock of a course's next session, in the
 * zone the page renders dates in (the viewer's, Europe/Istanbul until the
 * time-zone cookie exists; MDRS-110). Pure, so a spec can pin it without a
 * request.
 */
export const formatNextSession = (
  at: Date | string,
  locale: string,
  timeZone: string
): string => {
  const date = typeof at === "string" ? new Date(at) : at;
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(locale, {
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone,
  }).format(date);
};
