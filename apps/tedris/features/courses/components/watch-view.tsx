"use client";

import { Badge } from "@medaris/ui/mds/badge";
import { Icon } from "@medaris/ui/mds/icon";
import { useTranslations } from "next-intl";
import { useEffect, useReducer, useState } from "react";
import {
  minutesSince,
  type StreamPhase,
  streamPhaseAfter,
} from "../watch-model";
import { useYouTubePlayer } from "../youtube-player";
import { LessonNotes } from "./lesson-notes";
import { LessonQuestions } from "./lesson-questions";
import { LiveChat } from "./live-chat";
import { MediaPlayer } from "./media-player";

/** The one frame of the watch page, which the notes panel and the page both read. */
export const WATCH_FRAME_ID = "watch-frame";

/** A stream is live until its player says it ended. */
const LIVE: StreamPhase = "live";

/** What the watch page plays, as the server worked it out for this viewer. */
export type WatchVideo =
  | {
      kind: "stream";
      /** The stream's link: the chat's source, and a link out when it cannot be framed. */
      url: string;
      /** The YouTube frame, its player API on; null when the link cannot be framed. */
      embedUrl: string | null;
    }
  | {
      kind: "recording";
      title: string;
      /** The provider's player; for Bunny, the link signed for this viewer. */
      embedUrl: string | null;
      /** Where a recording that cannot be framed opens. */
      openUrl: string | null;
      bunny: boolean;
      /** "Ders kaydı · 3 Ekim 2026 Cumartesi · 58 dk". */
      facts: string;
      /** A YouTube frame with its player API on: the notes read its position. */
      reportsPosition: boolean;
    };

/** The page's clock, from the server's instant, every half minute. */
const useClock = (renderedAt: string, ticking: boolean): Date => {
  const [now, setNow] = useState(() => new Date(renderedAt));
  useEffect(() => {
    if (!ticking) return;
    setNow(new Date());
    const timer = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(timer);
  }, [ticking]);
  return now;
};

/**
 * The watch page of a celse (MDRS-285, wireframes approved 2026-10-11): the
 * video over the whole width that is left, and beside it, about 380 px wide,
 * "Canlı sohbet" while the stream is live or "Soru sor" once it has ended and
 * for a recording, over "Notlarım". Below about 1036 px the side column goes
 * under the video; on a phone the video comes first and the two panels are
 * two tabs under it. Nothing else of the celse is here: the join card, the
 * agenda and the resources are on the detail page this one is entered from.
 *
 * The stream's end is the player's to tell, on this page only: its
 * `onStateChange` drives `streamPhaseAfter` through the hook the notes use,
 * and nothing goes to the server. A page opened after the stream ended, or
 * whose player never started, keeps the chat until the celse has a READY
 * recording; then tedrisat stops sending the stream and the page shows the
 * recording.
 */
export function WatchView({
  courseId,
  courseTitle,
  timeZone,
  lessonId,
  weekNumber,
  title,
  startsAt,
  renderedAt,
  video,
  notes,
  questions,
}: {
  courseId: string;
  courseTitle: string;
  /** The course's zone. */
  timeZone: string;
  lessonId: string;
  weekNumber: number;
  title: string;
  /** The scheduled start, ISO; null for a celse without one. */
  startsAt: string | null;
  /** The instant the server rendered at, so the first client paint matches it. */
  renderedAt: string;
  video: WatchVideo;
  /** The viewer takes notes: an enrolled talebe. */
  notes: boolean;
  /** The viewer asks questions: an enrolled talebe. */
  questions: boolean;
}) {
  const t = useTranslations("tedrisLearn.WatchPage");
  const stream = video.kind === "stream" ? video : null;
  const framedStream = Boolean(stream?.embedUrl);
  const [phase, report] = useReducer(streamPhaseAfter, LIVE);
  useYouTubePlayer(framedStream ? WATCH_FRAME_ID : null, report);
  const now = useClock(renderedAt, Boolean(stream && startsAt));

  const chat = stream !== null && framedStream && phase === "live";
  // Once shown, "Soru sor" stays mounted (hidden while the chat is back), so
  // a question being written survives a stream that starts again.
  const [keepQuestions, setKeepQuestions] = useState(false);
  useEffect(() => {
    if (!chat) setKeepQuestions(true);
  }, [chat]);
  const showQuestions = questions && (!chat || keepQuestions);
  const top = chat || questions;
  const [tab, setTab] = useState<"top" | "notes">("top");
  const tabs = top && notes;

  const badge = stream ? (
    phase === "live" ? (
      <Badge variant="live">
        {startsAt
          ? t("liveBadge", { minutes: minutesSince(new Date(startsAt), now) })
          : t("liveBadgeShort")}
      </Badge>
    ) : (
      <Badge>{t("endedBadge")}</Badge>
    )
  ) : video.kind === "recording" ? (
    <Badge>{video.facts}</Badge>
  ) : null;

  const player =
    video.kind === "stream" ? (
      <MediaPlayer
        id="watch-video-title"
        title={t("streamTitle")}
        embedUrl={video.embedUrl}
        frameId={WATCH_FRAME_ID}
        placeholder={t("streamPlaceholder")}
        openHref={video.embedUrl ? null : video.url}
        openLabel={t("streamOpen")}
      >
        {/* The player stays after the end: the archive may play in it. */}
        {t(phase === "live" ? "streamLiveText" : "streamEndedText")}
      </MediaPlayer>
    ) : (
      <MediaPlayer
        id="watch-video-title"
        title={video.title}
        embedUrl={video.embedUrl}
        frameId={WATCH_FRAME_ID}
        frameTitle={
          video.bunny ? t("bunnyFrameTitle", { title: video.title }) : undefined
        }
        placeholder={t("recordingPlaceholder")}
        openHref={video.embedUrl ? null : video.openUrl}
        openLabel={t("recordingOpen")}
      />
    );

  // Only a YouTube frame reports a position; with any other the time is typed.
  const reportsPosition =
    video.kind === "stream" ? framedStream : video.reportsPosition;

  return (
    <main className="font-ui flex inline-full flex-wrap items-start gap-4 pbs-4 pbe-10 px-6 max-md:gap-0 max-md:px-0 max-md:pbs-0">
      <div className="flex basis-full flex-wrap items-center gap-x-4 gap-y-2 max-md:order-2 max-md:px-gutter max-md:py-3">
        <a
          className="mds-btn mds-btn--link inline-flex items-center gap-1"
          href={`/courses/${courseId}`}
        >
          <Icon name="arrowLeft" size="sm" />
          <span className="mds-visually-hidden">{t("backSr")}</span>
          <span dir="auto">{courseTitle}</span>
        </a>
        <h1 className="mds-h4" dir="auto">
          {t("heading", { week: weekNumber, title })}
        </h1>
        {badge}
        {/* The badge follows the player, and a screen reader hears the
            stream end or start again; not every minute it counts. */}
        {stream ? (
          <span className="mds-visually-hidden" aria-live="polite">
            {t(phase === "live" ? "liveBadgeShort" : "endedBadge")}
          </span>
        ) : null}
        <a
          className="mds-btn mds-btn--link ms-auto"
          href={`/courses/${courseId}/lessons/${lessonId}`}
        >
          {t("details")}
        </a>
      </div>

      {/* On a phone the video runs edge to edge, as in the wireframe. */}
      <div className="min-inline-0 flex-[999_1_640px] max-md:order-1 max-md:basis-full max-md:[&>.mds-card]:rounded-none max-md:[&>.mds-card]:border-x-0">
        {player}
      </div>

      {top || notes ? (
        <aside
          className="flex min-inline-0 flex-[1_1_380px] flex-col gap-4 max-md:order-3 max-md:basis-full max-md:px-gutter"
          aria-label={t(
            chat ? (notes ? "sideLive" : "chatTab") : "sideQuestions"
          )}
        >
          {tabs ? (
            // On a phone the two panels are two tabs under the video; wider,
            // both are in sight and the row is not drawn. Two toggles in a
            // fieldset, not the kit's `Tabs`: wider, both panels show at
            // once, which a tab list cannot say.
            <fieldset className="mds-tabs md:hidden min-inline-0 border-0 pbe-0">
              <legend className="mds-visually-hidden">{t("panels")}</legend>
              <button
                type="button"
                className={`mds-tab flex-1 justify-center${tab === "top" ? " is-active" : ""}`}
                aria-pressed={tab === "top"}
                onClick={() => setTab("top")}
              >
                {t(chat ? "chatTab" : "questionsTab")}
              </button>
              <button
                type="button"
                className={`mds-tab flex-1 justify-center${tab === "notes" ? " is-active" : ""}`}
                aria-pressed={tab === "notes"}
                onClick={() => setTab("notes")}
              >
                {t("notesTab")}
              </button>
            </fieldset>
          ) : null}
          {top ? (
            <div
              className={tabs && tab !== "top" ? "max-md:hidden" : undefined}
              data-watch-panel="top"
            >
              {chat && stream ? <LiveChat streamUrl={stream.url} /> : null}
              {showQuestions ? (
                <div hidden={chat}>
                  <LessonQuestions
                    courseId={courseId}
                    lessonId={lessonId}
                    timeZone={timeZone}
                  />
                </div>
              ) : null}
            </div>
          ) : null}
          {notes ? (
            <div
              className={tabs && tab !== "notes" ? "max-md:hidden" : undefined}
              data-watch-panel="notes"
            >
              <LessonNotes
                lessonId={lessonId}
                frameId={reportsPosition ? WATCH_FRAME_ID : null}
              />
            </div>
          ) : null}
        </aside>
      ) : null}
    </main>
  );
}
