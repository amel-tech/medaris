"use client";

import { SessionJoin } from "@medaris/ui/mds/session-join";
import { useEffect, useState } from "react";
import { sessionStateOf } from "../session-model";
import { CalendarMenu, type CalendarMenuLabels } from "./calendar-menu";

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
  recordingsLabel?: string;
  /** keeps a literal `{minutes}`, which the card fills in while the celse runs */
  elapsedText?: string;
}

export type CalendarLabels = CalendarMenuLabels;

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
  recordingsHref,
  headingLevel,
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
  /** where "Ders kayıtlarına git" goes once the celse is over; absent without a recording */
  recordingsHref?: string;
  /** set where the card names its celse (Ana sayfa: 3); the session page's own h1 already does */
  headingLevel?: 2 | 3 | 4;
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

  const { elapsedText, ...joinLabels } = labels;
  const elapsed =
    state === "live" && elapsedText
      ? elapsedText.replace(
          "{minutes}",
          String(
            Math.max(
              0,
              Math.floor(
                (now.getTime() - new Date(startsAt).getTime()) / 60_000
              )
            )
          )
        )
      : undefined;

  // Not on a live celse: the design's live card has only the way in.
  const addToCalendar =
    calendar && state === "upcoming" ? (
      <CalendarMenu
        text
        courseId={courseId}
        courseTitle={courseTitle}
        lesson={{ id: lessonId, title, startsAt, durationMinutes }}
        locale={locale}
        labels={calendar}
      />
    ) : undefined;

  return (
    <SessionJoin
      startsAt={startsAt}
      durationMinutes={durationMinutes}
      timeZone={timeZone}
      courseTimeZone={courseTimeZone}
      state={state}
      title={headingLevel ? title : undefined}
      headingLevel={headingLevel}
      platform={meetingUrl ? platform : undefined}
      host={platformHost}
      href={meetingUrl}
      actions={addToCalendar}
      recordingsHref={recordingsHref}
      elapsedText={elapsed}
      now={now}
      locale={locale}
      {...joinLabels}
    />
  );
}
