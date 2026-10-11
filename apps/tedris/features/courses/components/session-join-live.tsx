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
  recordingsLabel?: string;
  /** keeps a literal `{minutes}`, which the card fills in while the celse runs */
  elapsedText?: string;
  /** MDRS-285: the watch page's button, for a stream and for a recording */
  watchStreamLabel?: string;
  watchRecordingLabel?: string;
  /** under the buttons when a stream and a meeting link are both offered */
  watchOrJoinText?: string;
}

export type CalendarLabels = CalendarMenuLabels;

/**
 * The join card of the session page (design tedris/15, 18). `SessionJoin` is
 * the kit's; this wrapper keeps its clock. The server hands over the instant
 * it rendered at, so the first client paint is the same markup, and a timer
 * moves it on every half minute: the countdown ("8 dakika sonra"), the
 * ten-minute join window and the live/ended states follow the clock without a
 * reload. The meeting link is whatever the API sent; a caller who may not read
 * it never got one. Without one, a stream or the in-person mark (MDRS-283)
 * says how the celse is attended instead.
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
  recordingsHref,
  watchHref,
  watch,
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
  /** where "Ders kayıtlarına git" goes once the celse is over; absent without a recording */
  recordingsHref?: string;
  /** the celse's watch page (MDRS-285); absent where the card offers no way to it */
  watchHref?: string;
  /** what the watch page plays as the page was rendered: the API's say, null for nothing */
  watch?: "stream" | "recording" | null;
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

  const {
    elapsedText,
    watchStreamLabel,
    watchRecordingLabel,
    watchOrJoinText,
    ...joinLabels
  } = labels;
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

  // MDRS-285: what the watch page plays is the API's say at render time. A
  // page drawn before the start has no stream link yet; the card still opens
  // the way to a stream once its clock reaches the start, as it says it will
  // ("yayın celse başlayınca burada açılır"), and the watch page then reads
  // the link itself. `hasLiveStream` reaches only who may read the content.
  const watching =
    watch ?? (hasLiveStream && state === "live" ? "stream" : null);
  const open = state === "upcoming" || state === "live";

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
      recordingsHref={recordingsHref}
      watchHref={watchHref && watching ? watchHref : undefined}
      watchLabel={
        watching === "recording" ? watchRecordingLabel : watchStreamLabel
      }
      watchText={
        watching === "stream" && meetingUrl && open
          ? watchOrJoinText
          : undefined
      }
      elapsedText={elapsed}
      now={now}
      locale={locale}
      {...joinLabels}
    />
  );
}
