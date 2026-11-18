"use client";

import type { LessonViewResponse } from "@medaris/services/tedrisat";
import { Button } from "@medaris/ui/mds/button";
import { Icon } from "@medaris/ui/mds/icon";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import { recordLessonView } from "../actions/views";
import { type BunnyEvent, useBunnyPlayer } from "../bunny-player";
import { formatOffset } from "../lesson-note-model";
import {
  REPORT_EVERY_MS,
  reportOf,
  resumeFrom,
  type ViewReport,
} from "../watch-progress-model";
import { type PlayerEvent, useYouTubePlayer } from "../youtube-player";

/** YouTube's `onStateChange` values the tracker reads. */
const ENDED = 0;
const PLAYING = 1;
const PAUSED = 2;

/** Which player the recording plays in: the two that report a position. */
export type TrackedPlayer = "youtube" | "bunny";

/**
 * The watch page's counter (MDRS-248, "sayaç çalışmıyor"): it sends where the
 * recording's player is to `PUT /lessons/:id/view` every 15 seconds while it
 * plays, on a pause, at the end and when the page is left, and draws the line
 * under the player: "Bu celseyi izledin" once the API counts it watched, or
 * "Kaldığın yerden devam et · 12:34" while there is a place to go back to.
 *
 * For an enrolled talebe only; the page leaves it out for anyone else, and
 * the API would refuse them. A report that fails is dropped: the next one
 * carries the newer position anyway.
 */
export function WatchProgress({
  lessonId,
  frameId,
  player,
  initial,
}: {
  lessonId: string;
  frameId: string;
  player: TrackedPlayer;
  /** The talebe's record of this celse when the page was rendered. */
  initial: LessonViewResponse | null;
}) {
  const t = useTranslations("tedrisLearn.WatchPage");
  const [view, setView] = useState(initial);
  const [resumed, setResumed] = useState(false);
  const sentAt = useRef(0);
  const latest = useRef<ViewReport | null>(null);

  const send = useCallback(
    (report: ViewReport | null) => {
      if (!report) return;
      sentAt.current = Date.now();
      latest.current = null;
      recordLessonView(lessonId, report)
        .then((res) => {
          if (res.success) setView(res.data);
        })
        .catch(() => {});
    },
    [lessonId]
  );

  // YouTube: its state says when it plays, pauses and ends; while it plays
  // the position is read on a timer.
  const [playing, setPlaying] = useState(false);
  const youtube = useYouTubePlayer(
    player === "youtube" ? frameId : null,
    (event: PlayerEvent) => {
      if (event.type !== "state") return;
      setPlaying(event.state === PLAYING);
      if (event.state === PAUSED || event.state === ENDED) {
        send(
          reportOf(
            youtube?.position(),
            youtube?.duration(),
            event.state === ENDED
          )
        );
      }
    }
  );
  useEffect(() => {
    if (!playing || !youtube) return;
    const timer = setInterval(
      () => send(reportOf(youtube.position(), youtube.duration())),
      REPORT_EVERY_MS
    );
    return () => clearInterval(timer);
  }, [playing, youtube, send]);

  // Bunny: the player sends its time several times a second; one in 15
  // seconds goes on, and a pause or the end goes at once.
  const bunny = useBunnyPlayer(
    player === "bunny" ? frameId : null,
    (event: BunnyEvent) => {
      if (event.type === "time") {
        const report = reportOf(event.seconds, event.duration);
        latest.current = report;
        if (Date.now() - sentAt.current >= REPORT_EVERY_MS) send(report);
      } else if (latest.current || event.type === "ended") {
        const last = latest.current;
        send(
          event.type === "ended"
            ? {
                positionSeconds: last?.positionSeconds ?? 0,
                ...(last?.durationSeconds
                  ? { durationSeconds: last.durationSeconds }
                  : {}),
                ended: true,
              }
            : last
        );
      }
    }
  );

  // Leaving the page sends the last position not yet sent.
  useEffect(() => {
    const flush = () => {
      const report =
        player === "youtube" && youtube
          ? reportOf(youtube.position(), youtube.duration())
          : latest.current;
      if (report && Date.now() - sentAt.current > 2_000) send(report);
    };
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, [player, youtube, send]);

  const seek = player === "youtube" ? youtube : bunny;
  const resume = resumed ? null : resumeFrom(initial);

  if (view?.completedAt) {
    return (
      <span
        className="inline-flex items-center gap-1 text-success-default"
        data-testid="watch-progress"
      >
        <Icon name="check" size="sm" />
        {t("watchedNote")}
      </span>
    );
  }
  if (resume !== null) {
    return (
      <span
        className="inline-flex flex-wrap items-center gap-2"
        data-testid="watch-progress"
      >
        {t("resumeNote", { time: formatOffset(resume) })}
        {seek ? (
          <Button
            variant="outline"
            size="small"
            onClick={() => {
              seek.seekTo(resume);
              setResumed(true);
            }}
          >
            {t("resumeButton")}
          </Button>
        ) : null}
      </span>
    );
  }
  return null;
}
