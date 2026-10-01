"use client";

import {
  DEFAULT_TIME_ZONE,
  isSameCalendarDay,
  showsDifferentTime,
  timeZoneCity,
} from "@medaris/utils";
import {
  type DateTimeFormatOptions,
  useFormatter,
  useTimeZone,
  useTranslations,
} from "next-intl";

/**
 * A session's start, in the zone the course is authored in and — when the
 * viewer's clock shows another time — in the viewer's own zone as well:
 * "21:00 İstanbul · 20:00 senin saatinle" (MDRS-110, designs B5/B7). Both
 * zones are explicit, so the server render and the browser agree.
 */
export const SessionTime = ({
  at,
  courseTimeZone,
  options,
  className,
}: {
  at: Date;
  courseTimeZone: string | null | undefined;
  options: DateTimeFormatOptions;
  className?: string;
}) => {
  const t = useTranslations("nizam");
  const format = useFormatter();
  const viewerTimeZone = useTimeZone() ?? DEFAULT_TIME_ZONE;
  const courseZone = courseTimeZone || DEFAULT_TIME_ZONE;

  if (!showsDifferentTime(at, courseZone, viewerTimeZone)) {
    return (
      <span className={className}>
        {format.dateTime(at, { ...options, timeZone: viewerTimeZone })}
      </span>
    );
  }

  const city =
    courseZone === DEFAULT_TIME_ZONE
      ? t("SessionTime.istanbul")
      : timeZoneCity(courseZone);
  const viewerTime = format.dateTime(
    at,
    isSameCalendarDay(at, courseZone, viewerTimeZone)
      ? { hour: "2-digit", minute: "2-digit", timeZone: viewerTimeZone }
      : {
          day: "numeric",
          month: "short",
          hour: "2-digit",
          minute: "2-digit",
          timeZone: viewerTimeZone,
        }
  );

  return (
    <span className={className}>
      {format.dateTime(at, { ...options, timeZone: courseZone })} {city}
      {" · "}
      {t("SessionTime.yourTime", { time: viewerTime })}
    </span>
  );
};
