"use client";

import { Icon } from "@medaris/ui/mds/icon";
import { Menu } from "@medaris/ui/mds/menu";
import { SessionJoin } from "@medaris/ui/mds/session-join";
import { useEffect, useState } from "react";
import {
  googleCalendarUrl,
  icsDownloadPath,
  sessionPagePath,
} from "../calendar-links";
import { sessionStateOf } from "../session-model";

export interface SessionJoinLabels {
  label: string;
  liveLabel: string;
  endedLabel: string;
  cancelledLabel: string;
  cancelledText: string;
  noLinkText: string;
  /** keeps a literal `{minutes}`, which the card fills in */
  joinOpensText: string;
  joinLabel: string;
  newTabLabel: string;
  revealLabel: string;
  localTimeLabel: string;
  minuteUnit: string;
}

export interface CalendarLabels {
  button: string;
  google: string;
  apple: string;
  linkIsOnPage: string;
}

/**
 * The join card of the session page (design tedris/15, 18). `SessionJoin` is
 * the kit's; this wrapper keeps its clock. The server hands over the instant
 * it rendered at, so the first client paint is the same markup, and a timer
 * moves it on every half minute: the countdown ("8 dakika sonra"), the
 * ten-minute join window and the live/ended states follow the clock without a
 * reload. The meeting link is whatever the API sent; a caller who may not read
 * it never got one.
 */
export function SessionJoinLive({
  renderedAt,
  startsAt,
  durationMinutes,
  cancelled,
  title,
  courseId,
  courseTitle,
  lessonId,
  meetingUrl,
  platform,
  platformHost,
  locale,
  timeZone,
  courseTimeZone,
  labels,
  calendar,
}: {
  renderedAt: string;
  startsAt: string;
  durationMinutes?: number;
  cancelled: boolean;
  title: string;
  courseId: string;
  courseTitle: string;
  lessonId: string;
  meetingUrl?: string;
  /** a platform id of the kit's chip; absent when there is no link */
  platform?: string;
  platformHost?: string;
  locale: string;
  timeZone: string;
  courseTimeZone: string;
  labels: SessionJoinLabels;
  /** present for a session a talebe may still add to a calendar */
  calendar?: CalendarLabels;
}) {
  const [now, setNow] = useState(() => new Date(renderedAt));
  useEffect(() => {
    setNow(new Date());
    const timer = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(timer);
  }, []);

  const state = sessionStateOf(
    {
      cancelledAt: cancelled ? new Date(0) : null,
      startsAt: new Date(startsAt),
      durationMinutes,
    },
    now
  );

  const addToCalendar =
    calendar && (state === "upcoming" || state === "live") ? (
      <Menu
        label={calendar.button}
        text={calendar.button}
        size="small"
        icon={<Icon name="calendar" size="sm" />}
        items={[
          {
            value: "google",
            label: calendar.google,
            onSelect: () => {
              const url = googleCalendarUrl({
                courseTitle,
                lesson: {
                  id: lessonId,
                  title,
                  scheduledAt: new Date(startsAt),
                  durationMinutes: durationMinutes ?? null,
                },
                pageUrl: `${window.location.origin}${sessionPagePath(courseId, lessonId)}`,
                linkIsOnPage: calendar.linkIsOnPage,
              });
              window.open(url, "_blank", "noopener,noreferrer");
            },
          },
          {
            value: "ics",
            label: calendar.apple,
            onSelect: () => {
              window.location.assign(icsDownloadPath(lessonId, locale));
            },
          },
        ]}
      />
    ) : undefined;

  return (
    <SessionJoin
      startsAt={startsAt}
      durationMinutes={durationMinutes}
      timeZone={timeZone}
      courseTimeZone={courseTimeZone}
      state={state}
      platform={meetingUrl ? platform : undefined}
      host={platformHost}
      href={meetingUrl}
      actions={addToCalendar}
      now={now}
      locale={locale}
      {...labels}
    />
  );
}
