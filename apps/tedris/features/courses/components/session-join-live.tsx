"use client";

import { SessionJoin } from "@medaris/ui/mds/session-join";
import { sessionStateOf } from "../session-model";
import { useCelseClock } from "../use-celse-clock";
import { CalendarMenu, type CalendarMenuLabels } from "./calendar-menu";

export interface SessionJoinLabels {
  label: string;
  liveLabel: string;
  endedLabel: string;
  cancelledLabel: string;
  cancelledText: string;
  noLinkText: string;
  /** MDRS-283: what a celse without a link says when a stream or the in-person mark covers it */
  inPersonText: string;
  streamText: string;
  streamLiveText: string;
  inPersonStreamText: string;
  inPersonStreamLiveText: string;
  /** keeps a literal `{minutes}`, which the card fills in */
  joinOpensText: string;
  joinLabel: string;
  newTabLabel: string;
  revealLabel: string;
  localTimeLabel: string;
  minuteUnit: string;
  /** keeps a literal `{minutes}`, which the card fills in while the celse runs */
  elapsedText?: string;
}

export type CalendarLabels = CalendarMenuLabels;

/**
 * The join card of Ana sayfa (design tedris/15, 18). `SessionJoin` is the
 * kit's; this wrapper keeps its clock. The server hands over the instant it
 * rendered at, so the first client paint is the same markup, and a timer
 * moves it on every half minute: the countdown ("8 dakika sonra"), the
 * ten-minute join window and the live/ended states follow the clock without a
 * reload. The meeting link is whatever the API sent; a caller who may not read
 * it never got one. Without one, a stream or the in-person mark (MDRS-283)
 * says how the celse is attended instead. The celse detail page has its own
 * main card since MDRS-289 (`SessionActionCard`).
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
  inPerson,
  hasLiveStream,
  locale,
  timeZone,
  courseTimeZone,
  labels,
  calendar,
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
  /** held in person: the session's own mark, else the course's (MDRS-283) */
  inPerson?: boolean;
  /** a live stream is set; absent for a caller who may not read it (MDRS-283) */
  hasLiveStream?: boolean;
  locale: string;
  timeZone: string;
  courseTimeZone: string;
  labels: SessionJoinLabels;
  /** present for a session a talebe may still add to a calendar */
  calendar?: CalendarLabels;
  /** set where the card names its celse (Ana sayfa: 3) */
  headingLevel?: 2 | 3 | 4;
}) {
  const now = useCelseClock(renderedAt);

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
      inPerson={inPerson}
      hasLiveStream={hasLiveStream}
      actions={addToCalendar}
      elapsedText={elapsed}
      now={now}
      locale={locale}
      {...joinLabels}
    />
  );
}
