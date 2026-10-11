import type {
  CourseDetailResponse,
  SessionResponse,
} from "@medaris/services/tedrisat";
import { getLocale, getTimeZone, getTranslations } from "next-intl/server";
import { canWriteNotes } from "../lesson-note-model";
import {
  embedUrlOf,
  liveEmbedUrlOf,
  playerApiUrlOf,
  type ReleaseTranslate,
  recordingReleaseOf,
  releaseWordsOf,
} from "../recordings-model";
import type { WatchTarget } from "../watch-model";
import { type WatchVideo, WatchView } from "./watch-view";

/**
 * The watch page of a celse (MDRS-285), its server half: what plays and who
 * may write beside it, worked out for this viewer; `WatchView` draws it. The
 * route has already sent anyone with nothing to watch to the detail page.
 *
 * The stream's frame always has YouTube's player API on: its state is how the
 * page learns the stream ended. A YouTube recording's frame gets it for an
 * enrolled talebe, whose notes read and move its position (MDRS-150). A Bunny
 * recording plays in the player link tedrisat signed for this viewer in this
 * response (MDRS-114), and reports no position.
 */
export const WatchPage = async ({
  course,
  session,
  target,
  now,
}: {
  course: CourseDetailResponse;
  session: SessionResponse;
  target: WatchTarget;
  now: Date;
}) => {
  const t = await getTranslations("tedrisLearn.WatchPage");
  const locale = await getLocale();
  // An enrolled talebe takes notes and asks questions (MDRS-150); anyone
  // else who may read the content only watches.
  const talebe =
    !session.contentLocked && canWriteNotes(course.enrollment?.status);

  let video: WatchVideo;
  if (target.kind === "stream") {
    video = {
      kind: "stream",
      url: target.url,
      embedUrl: playerApiUrlOf(liveEmbedUrlOf(target.url)),
    };
  } else {
    const { recording } = target;
    const embed = embedUrlOf(recording.provider, recording.url);
    const reportsPosition =
      talebe && recording.provider === "YOUTUBE" && embed !== null;
    const recordedOn = recording.recordedAt
      ? new Intl.DateTimeFormat(locale, {
          day: "numeric",
          month: "long",
          year: "numeric",
          timeZone: course.timeZone,
        }).format(recording.recordedAt)
      : null;
    video = {
      kind: "recording",
      title: recording.title,
      embedUrl: reportsPosition ? playerApiUrlOf(embed) : embed,
      openUrl: recording.url ?? null,
      bunny: recording.provider === "BUNNY",
      facts: [
        t("recordingBadge"),
        recordedOn,
        recording.durationMinutes != null
          ? t("minutes", { count: recording.durationMinutes })
          : null,
      ]
        .filter(Boolean)
        .join(" · "),
      reportsPosition,
    };
  }

  // MDRS-288: a recording held back until the time the course team set. A
  // talebe, sent no link to it, watches the stream while tedrisat still
  // sends it and is told when the recording opens; the course team plays
  // the recording and is told when talebe may.
  const release = recordingReleaseOf(session.recording, now);
  const releaseWords = release
    ? releaseWordsOf(
        release,
        (await getTranslations(
          "tedrisLearn.RecordingRelease"
        )) as ReleaseTranslate,
        {
          locale,
          courseTimeZone: course.timeZone,
          viewerTimeZone: await getTimeZone(),
        }
      )
    : null;

  return (
    <WatchView
      courseId={course.id}
      courseTitle={course.title}
      timeZone={course.timeZone}
      lessonId={session.id}
      weekNumber={session.weekNumber}
      title={session.title}
      startsAt={session.startsAt?.toISOString() ?? null}
      renderedAt={now.toISOString()}
      video={video}
      release={releaseWords}
      notes={talebe}
      questions={talebe}
    />
  );
};
